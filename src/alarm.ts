import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { cancelAlarm, isAlarmKitAvailable, requestAlarmAuthorization, scheduleAlarm } from '../modules/bus-alarm';
import { distanceMeters, distanceToStop, pointBeforeEnd } from './geo';
import { alarmSound, loadSettings } from './settings';
import { loadArmedTrip, saveArmedTrip, type AlarmOptions, type ArmedTrip, type Destination } from './storage';

const LOCATION_TASK = 'wake-location-updates';
const GEOFENCE_TASK = 'wake-geofence';
// Fixed AlarmKit ids: one rings on arrival, the other is the time-based backup.
const ARRIVAL_ALARM_ID = '6F1C2B4E-8A3D-4F5B-9C7E-1D2A3B4C5D6E';
const BACKUP_ALARM_ID = 'A9B8C7D6-E5F4-4A3B-8C2D-1E0F9A8B7C6D';

// After this long past the bus's due time the ride is over, even if the alarm was never dismissed.
const EXPIRES_AFTER_MS = 60 * 60 * 1000;

const listeners = new Set<(trip: ArmedTrip | null) => void>();

export function subscribe(fn: (trip: ArmedTrip | null) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

async function setTrip(trip: ArmedTrip | null) {
  await saveArmedTrip(trip);
  listeners.forEach((fn) => fn(trip));
}

const alarmTitle = (trip: Destination) => `Wake up — ${trip.name} is next`;

// Location is only followed while an alarm is waiting to ring: never before one is set, and not after it rings.
async function stopTracking() {
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  if (await Location.hasStartedGeofencingAsync(GEOFENCE_TASK)) await Location.stopGeofencingAsync(GEOFENCE_TASK);
}

const isExpired = (trip: ArmedTrip) => !!trip.dueAt && Date.now() > trip.dueAt + EXPIRES_AFTER_MS;

// On launch: stop any tracking left running without a pending alarm (rang, expired, or app data cleared).
export async function syncTracking() {
  const trip = await loadArmedTrip();
  if (trip && isExpired(trip)) return disarm();
  if (!trip || trip.fired) await stopTracking();
}

async function fire() {
  const trip = await loadArmedTrip();
  if (!trip || trip.fired) return;
  await setTrip({ ...trip, fired: true });
  await stopTracking();

  if (isAlarmKitAvailable()) {
    // A system alarm rings through silent mode and Focus, full screen on the lock screen.
    cancelAlarm(BACKUP_ALARM_ID);
    await scheduleAlarm(ARRIVAL_ALARM_ID, new Date(), alarmTitle(trip), alarmSound(await loadSettings()));
    return;
  }
  // Pre-iOS 26 fallback: a time-sensitive notification (muted by the silent switch).
  await Notifications.scheduleNotificationAsync({
    content: { title: 'Wake up! 🚌', body: `You're almost at ${trip.name}.`, sound: alarmSound(await loadSettings()) ?? 'default', interruptionLevel: 'timeSensitive' },
    trigger: null,
  });
}

async function check(location: { latitude: number; longitude: number }) {
  const trip = await loadArmedTrip();
  if (!trip || trip.fired) return stopTracking();
  if (isExpired(trip)) return disarm();
  if (distanceToStop(location, trip) <= trip.radius) await fire();
}

TaskManager.defineTask<{ locations: Location.LocationObject[] }>(LOCATION_TASK, async ({ data, error }) => {
  if (error || !data) return;
  const last = data.locations.at(-1);
  if (last) await check(last.coords);
});

TaskManager.defineTask<{ eventType: Location.GeofencingEventType }>(GEOFENCE_TASK, async ({ data, error }) => {
  if (error || !data) return;
  if (data.eventType === Location.GeofencingEventType.Enter) await fire();
});

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function requestPermissions(): Promise<string | null> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') return 'Location permission is required.';
  const bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.status !== 'granted') return 'Choose "Always" location access in Settings so the alarm works with the screen locked.';
  if (isAlarmKitAvailable()) {
    if ((await requestAlarmAuthorization()) !== 'authorized') return 'Allow alarms for Bus Buddy in Settings so it can wake you up.';
  } else {
    await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true } });
  }
  return null;
}

// Backup: also ring backupMin before dueAt even if location never triggers.
const backupTime = (dueAt: number | undefined, backupMin: number) => (dueAt && backupMin ? dueAt - backupMin * 60000 : undefined);

async function scheduleBackup(dest: Destination, backupAt: number | undefined) {
  if (!isAlarmKitAvailable()) return;
  cancelAlarm(BACKUP_ALARM_ID);
  if (backupAt && backupAt > Date.now()) await scheduleAlarm(BACKUP_ALARM_ID, new Date(backupAt), alarmTitle(dest), alarmSound(await loadSettings()));
}

// iOS geofences are circles, so size it to where the route is `radius` from the stop. On a winding
// route that's closer than `radius` in a straight line, which keeps the backup trigger from ringing early.
function geofence(dest: Destination, radius: number): Location.LocationRegion {
  const ringAt = dest.path && dest.path.length > 1 ? distanceMeters(pointBeforeEnd(dest.path, radius), dest) : radius;
  return { identifier: dest.id, latitude: dest.latitude, longitude: dest.longitude, radius: Math.max(150, ringAt), notifyOnEnter: true, notifyOnExit: false };
}

export async function arm(dest: Destination, { radius, backupMin }: AlarmOptions, dueAt?: Date) {
  const due = dueAt?.getTime();
  const backupAt = backupTime(due, backupMin);
  await setTrip({ ...dest, radius, fired: false, dueAt: due, backupMin, backupAt });
  await scheduleBackup(dest, backupAt);
  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.High,
    distanceInterval: 100,
    activityType: Location.ActivityType.AutomotiveNavigation,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
  });
  // Backup trigger: iOS can relaunch the app on region entry even if it was killed.
  await Location.startGeofencingAsync(GEOFENCE_TASK, [geofence(dest, radius)]);
}

// Change the ring distance and backup of the alarm that's already set.
export async function updateAlarm({ radius, backupMin }: AlarmOptions) {
  const trip = await loadArmedTrip();
  if (!trip || trip.fired) return;
  const backupAt = backupTime(trip.dueAt, backupMin);
  await setTrip({ ...trip, radius, backupMin, backupAt });
  await scheduleBackup(trip, backupAt);
  // Starting geofencing again replaces the old region.
  await Location.startGeofencingAsync(GEOFENCE_TASK, [geofence(trip, radius)]);
  const here = await Location.getLastKnownPositionAsync().catch(() => null);
  if (here) await check(here.coords);
}

export async function disarm() {
  cancelAlarm(ARRIVAL_ALARM_ID);
  cancelAlarm(BACKUP_ALARM_ID);
  await stopTracking();
  await Notifications.dismissAllNotificationsAsync();
  await setTrip(null);
}
