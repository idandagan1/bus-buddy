import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { Alert, Linking } from 'react-native';
import { arm, requestPermissions } from './alarm';
import { milesToMeters } from './geo';
import type { LiveSummary } from './live';
import type { Trip, TripStop } from './types';
import { wakeBefore } from './wake';

jest.mock('./alarm', () => ({ arm: jest.fn(), requestPermissions: jest.fn() }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const mockArm = arm as jest.Mock;
const mockPermissions = requestPermissions as jest.Mock;

const at = (name: string, time: string, latitude: number): TripStop => ({ name, time: `2026-11-19T${time}:00-05:00`, latitude, longitude: -73.9 });
const trip = {
  id: 'trip-1',
  stops: [at('Port Authority', '19:30', 40.75), at('Englewood', '19:55', 40.89), at('Tenafly', '20:10', 40.92)],
} as Trip;
const live = (arrivalDelayMin: number | null) => ({ arrivalDelayMin }) as LiveSummary;

let alertSpy: jest.SpyInstance;
let openSettings: jest.SpyInstance;

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  mockPermissions.mockResolvedValue(null);
  mockArm.mockResolvedValue(undefined);
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
});

describe('wakeBefore', () => {
  it('arms for the last stop with the saved distance and backup, then opens the alarm screen', async () => {
    await AsyncStorage.setItem('settings', JSON.stringify({ radiusM: milesToMeters(2), backupMin: 10 }));
    await wakeBefore(trip, null);
    expect(mockArm).toHaveBeenCalledWith(
      {
        id: 'trip-1',
        name: 'Tenafly',
        latitude: 40.92,
        longitude: -73.9,
        path: trip.stops.map(({ latitude, longitude }) => ({ latitude, longitude })),
      },
      { radius: milesToMeters(2), backupMin: 10 },
      new Date('2026-11-19T20:10:00-05:00'),
    );
    expect(router.push).toHaveBeenCalledWith('/alarm');
  });

  it('can wake before an earlier stop, with the route only that far', async () => {
    await wakeBefore(trip, null, 1);
    const [dest, , dueAt] = mockArm.mock.calls[0];
    expect(dest).toMatchObject({ name: 'Englewood', path: [{ latitude: 40.75, longitude: -73.9 }, { latitude: 40.89, longitude: -73.9 }] });
    expect(dueAt).toEqual(new Date('2026-11-19T19:55:00-05:00'));
  });

  it('moves the backup later for a late bus and earlier for an early one', async () => {
    await wakeBefore(trip, live(7));
    expect(mockArm.mock.calls[0][2]).toEqual(new Date('2026-11-19T20:17:00-05:00'));
    await wakeBefore(trip, live(-3));
    expect(mockArm.mock.calls[1][2]).toEqual(new Date('2026-11-19T20:07:00-05:00'));
  });

  it('uses the schedule when live data has no arrival delay', async () => {
    await wakeBefore(trip, live(null));
    expect(mockArm.mock.calls[0][2]).toEqual(new Date('2026-11-19T20:10:00-05:00'));
  });

  it('sends the rider to Settings instead of arming without permission', async () => {
    mockPermissions.mockResolvedValue('Allow location “Always” so the alarm works with the screen off.');
    await wakeBefore(trip, null);
    expect(mockArm).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
    const [title, message, buttons] = alertSpy.mock.calls[0];
    expect(title).toBe('Permission needed');
    expect(message).toMatch(/Always/);
    expect(buttons.map((b: { text: string }) => b.text)).toEqual(['Not now', 'Open Settings']);
    buttons[1].onPress();
    expect(openSettings).toHaveBeenCalled();
  });

  it('stays on the trip when arming fails', async () => {
    mockArm.mockRejectedValue(new Error('AlarmKit unavailable'));
    await expect(wakeBefore(trip, null)).rejects.toThrow('AlarmKit unavailable');
    expect(router.push).not.toHaveBeenCalled();
  });
});
