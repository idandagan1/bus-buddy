import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { cancelAlarm, isAlarmKitAvailable, requestAlarmAuthorization, scheduleAlarm } from '../modules/bus-alarm';
import { distanceMeters } from './geo';
import { alarmSound, loadSettings } from './settings';
import { loadArmedTrip, saveArmedTrip, type ArmedTrip, type Destination } from './storage';

const LOCATION_TASK = 'wake-location-updates';
const GEOFENCE_TASK = 'wake-geofence';
// Fixed AlarmKit ids: one rings on arrival, the other is the time-based backup.
const ARRIVAL_ALARM_ID = '6F1C2B4E-8A3D-4F5B-9C7E-1D2A3B4C5D6E';
const BACKUP_ALARM_ID = 'A9B8C7D6-E5F4-4A3B-8C2D-1E0F9A8B7C6D';

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

async function fire() {
  const trip = await loadArmedTrip();
  if (!trip || trip.fired) return;
  await setTrip({ ...trip, fired: true });

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
  if (trip && !trip.fired && distanceMeters(location, trip) <= trip.radius) await fire();
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

// backupAt: also ring at this time even if location never triggers (e.g. scheduled arrival minus a few minutes).
export async function arm(dest: Destination, radius: number, backupAt?: Date) {
  await setTrip({ ...dest, radius, fired: false, backupAt: backupAt?.getTime() });
  if (backupAt && isAlarmKitAvailable()) {
    await scheduleAlarm(BACKUP_ALARM_ID, backupAt, alarmTitle(dest), alarmSound(await loadSettings()));
  }
  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.High,
    distanceInterval: 100,
    activityType: Location.ActivityType.AutomotiveNavigation,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
  });
  // Backup trigger: iOS can relaunch the app on region entry even if it was killed.
  await Location.startGeofencingAsync(GEOFENCE_TASK, [
    { identifier: dest.id, latitude: dest.latitude, longitude: dest.longitude, radius, notifyOnEnter: true, notifyOnExit: false },
  ]);
}

export async function disarm() {
  cancelAlarm(ARRIVAL_ALARM_ID);
  cancelAlarm(BACKUP_ALARM_ID);
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  if (await Location.hasStartedGeofencingAsync(GEOFENCE_TASK)) await Location.stopGeofencingAsync(GEOFENCE_TASK);
  await Notifications.dismissAllNotificationsAsync();
  await setTrip(null);
}
