import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { cancelAlarm, isAlarmKitAvailable, requestAlarmAuthorization, scheduleAlarm } from '../modules/bus-alarm';
import { arm, disarm, requestPermissions, subscribe, syncTracking, updateAlarm } from './alarm';
import { milesToMeters } from './geo';
import { loadArmedTrip, type ArmedTrip, type Destination } from './storage';

jest.mock('expo-location', () => ({
  Accuracy: { High: 4, Balanced: 3 },
  ActivityType: { AutomotiveNavigation: 2 },
  GeofencingEventType: { Enter: 1, Exit: 2 },
  requestForegroundPermissionsAsync: jest.fn(),
  requestBackgroundPermissionsAsync: jest.fn(),
  hasStartedLocationUpdatesAsync: jest.fn(),
  stopLocationUpdatesAsync: jest.fn(),
  hasStartedGeofencingAsync: jest.fn(),
  stopGeofencingAsync: jest.fn(),
  startLocationUpdatesAsync: jest.fn(),
  startGeofencingAsync: jest.fn(),
  getLastKnownPositionAsync: jest.fn(),
}));
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  dismissAllNotificationsAsync: jest.fn(),
}));
jest.mock('expo-task-manager', () => ({ defineTask: jest.fn() }));
jest.mock('../modules/bus-alarm', () => ({
  isAlarmKitAvailable: jest.fn(),
  requestAlarmAuthorization: jest.fn(),
  scheduleAlarm: jest.fn(),
  cancelAlarm: jest.fn(),
}));

const ARRIVAL = '6F1C2B4E-8A3D-4F5B-9C7E-1D2A3B4C5D6E';
const BACKUP = 'A9B8C7D6-E5F4-4A3B-8C2D-1E0F9A8B7C6D';
const NOW = new Date('2026-11-19T20:00:00-05:00').getTime();
const MIN = 60000;
const MILE = milesToMeters(1);

const loc = Location as jest.Mocked<typeof Location>;
const notif = Notifications as jest.Mocked<typeof Notifications>;
const alarmKit = isAlarmKitAvailable as jest.Mock;
const authorize = requestAlarmAuthorization as jest.Mock;
const schedule = scheduleAlarm as jest.Mock;
const cancel = cancelAlarm as jest.Mock;

// The tasks and notification handler are registered once, when alarm.ts loads.
const defineTask = TaskManager.defineTask as jest.Mock;
const task = (name: string) => defineTask.mock.calls.find(([n]) => n === name)![1] as (body: { data?: unknown; error?: unknown }) => Promise<void>;
const locationTask = task('wake-location-updates');
const geofenceTask = task('wake-geofence');
const notificationHandler = (Notifications.setNotificationHandler as jest.Mock).mock.calls[0][0];

const tenafly: Destination = { id: 'stop-1', name: 'Tenafly', latitude: 40.92, longitude: -73.96 };
// ~1 degree of latitude is 111 km, so these are well outside / inside a mile.
const far = { latitude: 40.75, longitude: -73.96 };
const near = { latitude: 40.915, longitude: -73.96 };
const at = (p: { latitude: number; longitude: number }) => ({ data: { locations: [{ coords: far }, { coords: p }] } });

const storeTrip = (trip: ArmedTrip) => AsyncStorage.setItem('armedTrip', JSON.stringify(trip));
const armed = (extra: Partial<ArmedTrip> = {}): ArmedTrip => ({ ...tenafly, radius: MILE, armedAt: NOW, dueAt: NOW + 30 * MIN, ...extra });

const fenceRadius = (call: number) => loc.startGeofencingAsync.mock.calls[call][1]![0].radius;

let tracking: boolean;
let fencing: boolean;

beforeEach(async () => {
  jest.useFakeTimers({ now: NOW });
  jest.clearAllMocks();
  await AsyncStorage.clear();
  tracking = false;
  fencing = false;
  loc.hasStartedLocationUpdatesAsync.mockImplementation(async () => tracking);
  loc.hasStartedGeofencingAsync.mockImplementation(async () => fencing);
  loc.startLocationUpdatesAsync.mockImplementation(async () => void (tracking = true));
  loc.startGeofencingAsync.mockImplementation(async () => void (fencing = true));
  loc.stopLocationUpdatesAsync.mockImplementation(async () => void (tracking = false));
  loc.stopGeofencingAsync.mockImplementation(async () => void (fencing = false));
  loc.getLastKnownPositionAsync.mockResolvedValue(null);
  alarmKit.mockReturnValue(true);
  schedule.mockResolvedValue('ok');
});

afterEach(async () => {
  // Clear the module's expiry timer so it doesn't leak between tests.
  await syncTracking();
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('module setup', () => {
  it('shows banners with sound and no badge', async () => {
    await expect(notificationHandler.handleNotification()).resolves.toEqual({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    });
  });
});

describe('requestPermissions', () => {
  const grant = (fg: string, bg = 'granted') => {
    loc.requestForegroundPermissionsAsync.mockResolvedValue({ status: fg } as never);
    loc.requestBackgroundPermissionsAsync.mockResolvedValue({ status: bg } as never);
  };

  it('stops at foreground location denied, without asking for background', async () => {
    grant('denied');
    await expect(requestPermissions()).resolves.toBe('Location permission is required.');
    expect(loc.requestBackgroundPermissionsAsync).not.toHaveBeenCalled();
  });

  it('asks for "Always" when background location is denied', async () => {
    grant('granted', 'denied');
    await expect(requestPermissions()).resolves.toMatch(/Always/);
    expect(authorize).not.toHaveBeenCalled();
  });

  it('asks to allow alarms when AlarmKit authorization is denied', async () => {
    grant('granted');
    authorize.mockResolvedValue('denied');
    await expect(requestPermissions()).resolves.toMatch(/Allow alarms/);
  });

  it('passes with AlarmKit authorized, without notification permission', async () => {
    grant('granted');
    authorize.mockResolvedValue('authorized');
    await expect(requestPermissions()).resolves.toBeNull();
    expect(notif.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('falls back to notification permission without AlarmKit', async () => {
    grant('granted');
    alarmKit.mockReturnValue(false);
    await expect(requestPermissions()).resolves.toBeNull();
    expect(notif.requestPermissionsAsync).toHaveBeenCalledWith({ ios: { allowAlert: true, allowSound: true } });
    expect(authorize).not.toHaveBeenCalled();
  });
});

describe('arm', () => {
  it('saves the trip, schedules the backup, and starts location updates and a geofence', async () => {
    const seen: (ArmedTrip | null)[] = [];
    const unsubscribe = subscribe((t) => seen.push(t));
    await arm(tenafly, { radius: MILE, backupMin: 10 }, new Date(NOW + 30 * MIN));
    unsubscribe();

    const saved = await loadArmedTrip();
    expect(saved).toEqual({ ...tenafly, radius: MILE, dueAt: NOW + 30 * MIN, backupMin: 10, backupAt: NOW + 20 * MIN, armedAt: NOW });
    expect(seen).toEqual([saved]);
    expect(cancel).toHaveBeenCalledWith(BACKUP);
    expect(schedule).toHaveBeenCalledWith(BACKUP, new Date(NOW + 20 * MIN), 'Wake up — Tenafly is next', 'rise.wav');
    expect(loc.startLocationUpdatesAsync).toHaveBeenCalledWith('wake-location-updates', expect.objectContaining({ accuracy: 4, distanceInterval: 100 }));
    expect(loc.startGeofencingAsync).toHaveBeenCalledWith('wake-geofence', [
      { identifier: 'stop-1', latitude: 40.92, longitude: -73.96, radius: MILE, notifyOnEnter: true, notifyOnExit: false },
    ]);
  });

  it('skips the backup when it would already be in the past', async () => {
    await arm(tenafly, { radius: MILE, backupMin: 15 }, new Date(NOW + 10 * MIN));
    expect((await loadArmedTrip())?.backupAt).toBe(NOW - 5 * MIN);
    expect(cancel).toHaveBeenCalledWith(BACKUP);
    expect(schedule).not.toHaveBeenCalled();
  });

  it('has no backup without a due time or with backup off', async () => {
    await arm(tenafly, { radius: MILE, backupMin: 10 });
    expect((await loadArmedTrip())?.backupAt).toBeUndefined();
    await arm(tenafly, { radius: MILE, backupMin: 0 }, new Date(NOW + 30 * MIN));
    expect((await loadArmedTrip())?.backupAt).toBeUndefined();
    expect(schedule).not.toHaveBeenCalled();
  });

  it('does not touch AlarmKit for the backup when it is unavailable', async () => {
    alarmKit.mockReturnValue(false);
    await arm(tenafly, { radius: MILE, backupMin: 10 }, new Date(NOW + 30 * MIN));
    expect(cancel).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
  });

  it('sizes the geofence along a winding path, never under 150 m', async () => {
    // A path that doubles back: the point a mile before the end along it is close to the stop in a straight line.
    const path = [
      { latitude: 40.92, longitude: -73.97 },
      { latitude: 40.92, longitude: -73.96 },
      { latitude: 40.92, longitude: -73.97 },
      { latitude: 40.92, longitude: -73.96 },
    ];
    await arm({ ...tenafly, path }, { radius: MILE, backupMin: 0 });
    const radius = fenceRadius(0);
    expect(radius).toBeLessThan(MILE);
    expect(radius).toBeGreaterThanOrEqual(150);

    await arm({ ...tenafly, path: [tenafly, tenafly] }, { radius: MILE, backupMin: 0 });
    expect(fenceRadius(1)).toBe(150);
  });

  it('re-arming replaces the trip already armed', async () => {
    await arm(tenafly, { radius: MILE, backupMin: 0 });
    await arm({ ...tenafly, id: 'stop-2', name: 'Englewood' }, { radius: MILE * 2, backupMin: 0 });
    expect(await loadArmedTrip()).toMatchObject({ id: 'stop-2', name: 'Englewood' });
  });
});

describe('location task', () => {
  it('ignores errors and empty updates', async () => {
    await storeTrip(armed());
    await locationTask({ error: new Error('denied') });
    await locationTask({});
    await locationTask({ data: { locations: [] } });
    expect(await loadArmedTrip()).not.toBeNull();
    expect(schedule).not.toHaveBeenCalled();
  });

  it('keeps waiting while the rider is still far from the stop', async () => {
    await storeTrip(armed());
    await locationTask(at(far));
    expect(await loadArmedTrip()).not.toBeNull();
    expect(schedule).not.toHaveBeenCalled();
  });

  it('rings once within the radius: cancels the backup, rings now, stops tracking and clears the trip', async () => {
    tracking = fencing = true;
    await storeTrip(armed());
    await AsyncStorage.setItem('settings', JSON.stringify({ tone: 'bells' }));
    await locationTask(at(near));

    expect(cancel).toHaveBeenCalledWith(BACKUP);
    expect(schedule).toHaveBeenCalledTimes(1);
    expect(schedule).toHaveBeenCalledWith(ARRIVAL, new Date(NOW), 'Wake up — Tenafly is next', 'bells.wav');
    expect(loc.stopLocationUpdatesAsync).toHaveBeenCalled();
    expect(loc.stopGeofencingAsync).toHaveBeenCalled();
    expect(await loadArmedTrip()).toBeNull();

    // A late update (or the geofence) after it rang does nothing more.
    await locationTask(at(near));
    await geofenceTask({ data: { eventType: Location.GeofencingEventType.Enter } });
    expect(schedule).toHaveBeenCalledTimes(1);
  });

  it('falls back to a time-sensitive notification without AlarmKit', async () => {
    alarmKit.mockReturnValue(false);
    await storeTrip(armed());
    await locationTask(at(near));
    expect(schedule).not.toHaveBeenCalled();
    expect(notif.scheduleNotificationAsync).toHaveBeenCalledWith({
      content: { title: 'Wake up! 🚌', body: "You're almost at Tenafly.", sound: 'rise.wav', interruptionLevel: 'timeSensitive' },
      trigger: null,
    });
  });

  it('uses the default notification sound when the tone is the system alarm', async () => {
    alarmKit.mockReturnValue(false);
    await AsyncStorage.setItem('settings', JSON.stringify({ tone: 'default' }));
    await storeTrip(armed());
    await locationTask(at(near));
    expect(notif.scheduleNotificationAsync.mock.calls[0][0].content.sound).toBe('default');
  });

  it('stops tracking left running with no alarm set', async () => {
    tracking = fencing = true;
    await locationTask(at(near));
    expect(loc.stopLocationUpdatesAsync).toHaveBeenCalledWith('wake-location-updates');
    expect(loc.stopGeofencingAsync).toHaveBeenCalledWith('wake-geofence');
    expect(schedule).not.toHaveBeenCalled();
  });

  it('disarms instead of ringing once the ride is long over', async () => {
    tracking = true;
    await storeTrip(armed({ dueAt: NOW - 61 * MIN, armedAt: NOW - 90 * MIN }));
    await locationTask(at(near));
    expect(schedule).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledWith(ARRIVAL);
    expect(notif.dismissAllNotificationsAsync).toHaveBeenCalled();
    expect(loc.stopLocationUpdatesAsync).toHaveBeenCalled();
    expect(await loadArmedTrip()).toBeNull();
  });
});

describe('geofence task', () => {
  it('rings on entering the region', async () => {
    await storeTrip(armed());
    await geofenceTask({ data: { eventType: Location.GeofencingEventType.Enter } });
    expect(schedule).toHaveBeenCalledWith(ARRIVAL, expect.any(Date), expect.any(String), 'rise.wav');
    expect(await loadArmedTrip()).toBeNull();
  });

  it('ignores exits, errors and missing data', async () => {
    await storeTrip(armed());
    await geofenceTask({ data: { eventType: Location.GeofencingEventType.Exit } });
    await geofenceTask({ error: new Error('x'), data: { eventType: Location.GeofencingEventType.Enter } });
    await geofenceTask({});
    expect(schedule).not.toHaveBeenCalled();
    expect(await loadArmedTrip()).not.toBeNull();
  });

  it('does nothing when no alarm is armed', async () => {
    await geofenceTask({ data: { eventType: Location.GeofencingEventType.Enter } });
    expect(schedule).not.toHaveBeenCalled();
    expect(notif.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});

describe('updateAlarm', () => {
  it('does nothing without an armed trip', async () => {
    await updateAlarm({ radius: MILE, backupMin: 5 });
    expect(loc.startGeofencingAsync).not.toHaveBeenCalled();
    expect(await loadArmedTrip()).toBeNull();
  });

  it('changes radius and backup, reschedules, and replaces the geofence', async () => {
    await storeTrip(armed({ backupMin: 5, backupAt: NOW + 25 * MIN }));
    await updateAlarm({ radius: MILE * 2, backupMin: 15 });
    expect(await loadArmedTrip()).toMatchObject({ radius: MILE * 2, backupMin: 15, backupAt: NOW + 15 * MIN, armedAt: NOW });
    expect(schedule).toHaveBeenCalledWith(BACKUP, new Date(NOW + 15 * MIN), expect.any(String), 'rise.wav');
    expect(fenceRadius(0)).toBe(MILE * 2);
  });

  it('turning backup off cancels it', async () => {
    await storeTrip(armed({ backupMin: 5, backupAt: NOW + 25 * MIN }));
    await updateAlarm({ radius: MILE, backupMin: 0 });
    expect((await loadArmedTrip())?.backupAt).toBeUndefined();
    expect(cancel).toHaveBeenCalledWith(BACKUP);
    expect(schedule).not.toHaveBeenCalled();
  });

  it('rings right away when the rider is already inside the new radius', async () => {
    await storeTrip(armed({ radius: milesToMeters(0.5) }));
    loc.getLastKnownPositionAsync.mockResolvedValue({ coords: near } as never);
    await updateAlarm({ radius: MILE * 2, backupMin: 0 });
    expect(schedule).toHaveBeenCalledWith(ARRIVAL, expect.any(Date), expect.any(String), 'rise.wav');
    expect(await loadArmedTrip()).toBeNull();
  });

  it('keeps the alarm when the last position is unavailable', async () => {
    await storeTrip(armed());
    loc.getLastKnownPositionAsync.mockRejectedValue(new Error('no fix'));
    await updateAlarm({ radius: MILE * 2, backupMin: 0 });
    expect(await loadArmedTrip()).toMatchObject({ radius: MILE * 2 });
  });
});

describe('disarm', () => {
  it('cancels both alarms, stops tracking, clears notifications and the trip, and tells subscribers', async () => {
    tracking = fencing = true;
    await storeTrip(armed());
    const fn = jest.fn();
    const unsubscribe = subscribe(fn);
    await disarm();
    unsubscribe();
    expect(cancel).toHaveBeenCalledWith(ARRIVAL);
    expect(cancel).toHaveBeenCalledWith(BACKUP);
    expect(loc.stopLocationUpdatesAsync).toHaveBeenCalled();
    expect(loc.stopGeofencingAsync).toHaveBeenCalled();
    expect(notif.dismissAllNotificationsAsync).toHaveBeenCalled();
    expect(await loadArmedTrip()).toBeNull();
    expect(fn).toHaveBeenCalledWith(null);
  });

  it('does not stop tracking that is not running', async () => {
    await disarm();
    expect(loc.stopLocationUpdatesAsync).not.toHaveBeenCalled();
    expect(loc.stopGeofencingAsync).not.toHaveBeenCalled();
  });

  it('unsubscribed listeners hear nothing', async () => {
    const fn = jest.fn();
    subscribe(fn)();
    await disarm();
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('syncTracking', () => {
  it('stops leftover tracking when no alarm is set', async () => {
    tracking = fencing = true;
    await syncTracking();
    expect(loc.stopLocationUpdatesAsync).toHaveBeenCalled();
    expect(loc.stopGeofencingAsync).toHaveBeenCalled();
  });

  it('finishes an alarm an older build kept as fired, without ringing again', async () => {
    tracking = true;
    await storeTrip(armed({ fired: true }));
    await syncTracking();
    expect(await loadArmedTrip()).toBeNull();
    expect(loc.stopLocationUpdatesAsync).toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
  });

  it('disarms an alarm an hour past its due time', async () => {
    await storeTrip(armed({ dueAt: NOW - 61 * MIN, armedAt: NOW - 2 * 60 * MIN }));
    await syncTracking();
    expect(await loadArmedTrip()).toBeNull();
    expect(cancel).toHaveBeenCalledWith(ARRIVAL);
  });

  it('keeps a pending alarm and its tracking', async () => {
    tracking = true;
    await storeTrip(armed());
    await syncTracking();
    expect(await loadArmedTrip()).not.toBeNull();
    expect(loc.stopLocationUpdatesAsync).not.toHaveBeenCalled();
  });

  it('expiry timer disarms an alarm whose rider never moves again', async () => {
    tracking = true;
    await arm(tenafly, { radius: MILE, backupMin: 0 }, new Date(NOW + 30 * MIN));
    // Due +30 min, expires an hour after that.
    await jest.advanceTimersByTimeAsync(89 * MIN);
    expect(await loadArmedTrip()).not.toBeNull();
    await jest.advanceTimersByTimeAsync(2 * MIN);
    expect(await loadArmedTrip()).toBeNull();
    expect(loc.stopLocationUpdatesAsync).toHaveBeenCalled();
  });

  it('caps an alarm without a due time at four hours from when it was set', async () => {
    await arm(tenafly, { radius: MILE, backupMin: 0 });
    await jest.advanceTimersByTimeAsync(4 * 60 * MIN - MIN);
    expect(await loadArmedTrip()).not.toBeNull();
    await jest.advanceTimersByTimeAsync(2 * MIN);
    expect(await loadArmedTrip()).toBeNull();
  });

  it('caps a due time far in the future at four hours from when it was set', async () => {
    await storeTrip(armed({ dueAt: NOW + 10 * 60 * MIN, armedAt: NOW - 4 * 60 * MIN - MIN }));
    await syncTracking();
    expect(await loadArmedTrip()).toBeNull();
  });

  it('caps a legacy alarm without armedAt from its due time', async () => {
    await storeTrip(armed({ armedAt: undefined, dueAt: NOW - 61 * MIN }));
    await syncTracking();
    expect(await loadArmedTrip()).toBeNull();
  });

  it('expires a legacy alarm with no armedAt and no due time', async () => {
    await storeTrip(armed({ armedAt: undefined, dueAt: undefined }));
    await syncTracking();
    await jest.advanceTimersByTimeAsync(24 * 60 * MIN);
    expect(await loadArmedTrip()).toBeNull();
  });
});
