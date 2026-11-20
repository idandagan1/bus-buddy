import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { Alert } from 'react-native';
import { disarm, subscribe, updateAlarm } from '@/alarm';
import AlarmScreen from '@/app/alarm';
import { AlarmEditor } from '@/components/AlarmEditor';
import { MyAlarms } from '@/components/MyAlarms';
import { showToast } from '@/components/Toast';
import { milesToMeters } from '@/geo';
import { saveArmedTrip, type ArmedTrip } from '@/storage';

jest.mock('react-native-reanimated', () => jest.requireActual('./reanimatedMock'));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  const Stack = function Stack() {
    return null;
  };
  Stack.Screen = function Screen() {
    return null;
  };
  return {
    router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn() },
    useFocusEffect: (cb: () => void) => useEffect(cb, [cb]),
    Stack,
  };
});
jest.mock('expo-location', () => ({ Accuracy: { Balanced: 3 }, watchPositionAsync: jest.fn() }));
jest.mock('@/alarm', () => ({ disarm: jest.fn(), subscribe: jest.fn(), updateAlarm: jest.fn() }));
jest.mock('@/components/Toast', () => ({ showToast: jest.fn() }));

const NOW = new Date('2026-11-19T20:00:00-05:00').getTime();
const MIN = 60000;
const MILE = milesToMeters(1);
const clock = (ms: number) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

const trip = (extra: Partial<ArmedTrip> = {}): ArmedTrip => ({
  id: 'stop-1',
  name: 'Tenafly',
  latitude: 40.92,
  longitude: -73.96,
  radius: MILE,
  armedAt: NOW,
  dueAt: NOW + 30 * MIN,
  backupMin: 5,
  backupAt: NOW + 25 * MIN,
  ...extra,
});

// subscribe() hands out the listener so a test can push alarm changes the way alarm.ts would.
let emit: (t: ArmedTrip | null) => void;
const unsubscribe = jest.fn();
const watchRemove = jest.fn();
let onPosition: (loc: { coords: { latitude: number; longitude: number } }) => void;

beforeEach(async () => {
  jest.useFakeTimers({ now: NOW });
  jest.clearAllMocks();
  await saveArmedTrip(null);
  jest.mocked(subscribe).mockImplementation((fn) => {
    emit = fn;
    return unsubscribe;
  });
  jest.mocked(Location.watchPositionAsync).mockImplementation(async (_opts, cb) => {
    onPosition = cb as typeof onPosition;
    return { remove: watchRemove };
  });
  jest.mocked(updateAlarm).mockResolvedValue(undefined);
  jest.mocked(router.canGoBack).mockReturnValue(true);
});

afterEach(() => {
  jest.useRealTimers();
});

const flush = () => act(async () => {
  await jest.advanceTimersByTimeAsync(0);
});

describe('alarm screen', () => {
  it('goes back when no alarm is set', async () => {
    await render(<AlarmScreen />);
    await flush();
    expect(router.back).toHaveBeenCalled();
    expect(screen.queryByText('Sleep well')).toBeNull();
    expect(Location.watchPositionAsync).not.toHaveBeenCalled();
  });

  it('goes home when there is nothing to go back to', async () => {
    jest.mocked(router.canGoBack).mockReturnValue(false);
    await render(<AlarmScreen />);
    await flush();
    expect(router.replace).toHaveBeenCalledWith('/');
  });

  it('shows the armed trip, its ring distance and backup time, and the distance left', async () => {
    await saveArmedTrip(trip());
    await render(<AlarmScreen />);
    await flush();
    expect(screen.getByText('Sleep well')).toBeTruthy();
    expect(screen.getByText('Tenafly')).toBeTruthy();
    expect(screen.getByText('Alarm rings 1 mi before your stop')).toBeTruthy();
    expect(screen.getByText(`Backup alarm at ${clock(NOW + 25 * MIN)}`)).toBeTruthy();
    expect(screen.queryByText(/to go$/)).toBeNull();
    expect(Location.watchPositionAsync).toHaveBeenCalledWith({ accuracy: 3, distanceInterval: 50 }, expect.any(Function));

    await act(async () => onPosition({ coords: { latitude: 40.92 - 3 / 111, longitude: -73.96 } }));
    expect(screen.getByText(/^1\.\d mi to go$/)).toBeTruthy();
    expect(router.back).not.toHaveBeenCalled();
  });

  it('has no backup line when the backup is off', async () => {
    await saveArmedTrip(trip({ backupMin: 0, backupAt: undefined }));
    await render(<AlarmScreen />);
    await flush();
    expect(screen.queryByText(/Backup alarm at/)).toBeNull();
  });

  it('draws the route sketch when the trip has a path', async () => {
    const path = [
      { latitude: 40.76, longitude: -73.99 },
      { latitude: 40.85, longitude: -73.97 },
      { latitude: 40.92, longitude: -73.96 },
    ];
    await saveArmedTrip(trip({ path }));
    await render(<AlarmScreen />);
    await flush();
    expect(screen.getByText('Sleep well')).toBeTruthy();
    await act(async () => onPosition({ coords: { latitude: 40.85, longitude: -73.97 } }));
    expect(screen.getByText(/mi to go$/)).toBeTruthy();
  });

  it('cancelling disarms with a toast', async () => {
    await saveArmedTrip(trip());
    await render(<AlarmScreen />);
    await flush();
    await fireEvent.press(screen.getByText('Cancel alarm'));
    expect(showToast).toHaveBeenCalledWith('Alarm cancelled');
    expect(disarm).toHaveBeenCalled();
  });

  it('the back button leaves without cancelling', async () => {
    await saveArmedTrip(trip());
    await render(<AlarmScreen />);
    await flush();
    await fireEvent.press(screen.getByText('‹ Back'));
    expect(router.back).toHaveBeenCalled();
    expect(disarm).not.toHaveBeenCalled();
  });

  it('opens the editor on Change and closes it on Cancel', async () => {
    await saveArmedTrip(trip());
    await render(<AlarmScreen />);
    await flush();
    await fireEvent.press(screen.getByText('Change'));
    expect(screen.getByText('Ring when the bus is within')).toBeTruthy();
    expect(screen.queryByText('Change')).toBeNull();
    await fireEvent.press(screen.getByText('Cancel'));
    expect(screen.getByText('Change')).toBeTruthy();
  });

  it('leaves when the alarm rings or is cancelled elsewhere, and stops watching position', async () => {
    await saveArmedTrip(trip());
    await render(<AlarmScreen />);
    await flush();
    await act(async () => emit(null));
    expect(router.back).toHaveBeenCalled();
    expect(watchRemove).toHaveBeenCalled();
  });

  it('follows an alarm changed elsewhere', async () => {
    await saveArmedTrip(trip());
    await render(<AlarmScreen />);
    await flush();
    await act(async () => emit(trip({ radius: milesToMeters(2) })));
    expect(screen.getByText('Alarm rings 2 mi before your stop')).toBeTruthy();
  });

  it('unsubscribes and stops watching position on unmount', async () => {
    await saveArmedTrip(trip());
    const { unmount } = await render(<AlarmScreen />);
    await flush();
    await unmount();
    expect(unsubscribe).toHaveBeenCalled();
    expect(watchRemove).toHaveBeenCalled();
  });

  it('stops watching position when unmounted before the watch starts', async () => {
    let resolve!: (s: { remove: () => void }) => void;
    jest.mocked(Location.watchPositionAsync).mockImplementation(() => new Promise((r) => (resolve = r)) as never);
    await saveArmedTrip(trip());
    const { unmount } = await render(<AlarmScreen />);
    await flush();
    await unmount();
    await act(async () => resolve({ remove: watchRemove }));
    expect(watchRemove).toHaveBeenCalled();
  });
});

describe('AlarmEditor', () => {
  it('saves the chosen distance and backup, then reports done', async () => {
    let finish!: () => void;
    jest.mocked(updateAlarm).mockImplementation(() => new Promise<void>((r) => (finish = r)));
    const onDone = jest.fn();
    await render(<AlarmEditor trip={trip()} onDone={onDone} />);
    await fireEvent.press(screen.getByText('2 mi'));
    await fireEvent.press(screen.getByText(`15 min · ${clock(NOW + 15 * MIN)}`));
    await fireEvent.press(screen.getByText('Save'));
    expect(screen.getByText('Saving…')).toBeTruthy();
    expect(updateAlarm).toHaveBeenCalledWith({ radius: milesToMeters(2), backupMin: 15 });
    expect(onDone).not.toHaveBeenCalled();
    await act(async () => finish());
    expect(showToast).toHaveBeenCalledWith('Alarm updated');
    expect(onDone).toHaveBeenCalled();
  });

  it('cancel reports done without saving', async () => {
    const onDone = jest.fn();
    await render(<AlarmEditor trip={trip()} onDone={onDone} />);
    await fireEvent.press(screen.getByText('Cancel'));
    expect(onDone).toHaveBeenCalled();
    expect(updateAlarm).not.toHaveBeenCalled();
  });

  it('falls back to 1 mi for a distance no longer offered', async () => {
    await render(<AlarmEditor trip={trip({ radius: 1000 })} onDone={jest.fn()} />);
    await fireEvent.press(screen.getByText('Save'));
    expect(updateAlarm).toHaveBeenCalledWith({ radius: MILE, backupMin: 5 });
  });

  it('offers only the distance for an alarm without a due time', async () => {
    await render(<AlarmEditor trip={trip({ dueAt: undefined, backupMin: undefined, backupAt: undefined })} onDone={jest.fn()} />);
    expect(screen.queryByText('Backup alarm')).toBeNull();
    expect(screen.queryByText('Off')).toBeNull();
    await fireEvent.press(screen.getByText('Save'));
    expect(updateAlarm).toHaveBeenCalledWith({ radius: MILE, backupMin: 0 });
  });

  it('disables backups that would already be in the past', async () => {
    // Due in 7 minutes: 5 min before is still ahead, 10 and 15 are gone.
    const dueAt = NOW + 7 * MIN;
    await render(<AlarmEditor trip={trip({ dueAt, backupMin: 0, backupAt: undefined })} onDone={jest.fn()} />);
    await fireEvent.press(screen.getByText(`10 min · ${clock(dueAt - 10 * MIN)}`));
    await fireEvent.press(screen.getByText('Save'));
    expect(updateAlarm).toHaveBeenLastCalledWith({ radius: MILE, backupMin: 0 });
    await fireEvent.press(screen.getByText(`5 min · ${clock(dueAt - 5 * MIN)}`));
    await fireEvent.press(screen.getByText('Save'));
    expect(updateAlarm).toHaveBeenLastCalledWith({ radius: MILE, backupMin: 5 });
  });
});

describe('MyAlarms', () => {
  it('explains how to set an alarm when none is armed', async () => {
    await render(<MyAlarms />);
    await flush();
    expect(screen.getByText(/No alarm set/)).toBeTruthy();
    expect(screen.queryByText('1')).toBeNull();
  });

  it('shows the armed trip with its distance and backup, and opens the alarm screen', async () => {
    await saveArmedTrip(trip());
    await render(<MyAlarms />);
    await flush();
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.getByText('Wake me before Tenafly')).toBeTruthy();
    expect(screen.getByText(`Rings 1 mi away · backup ${clock(NOW + 25 * MIN)}`)).toBeTruthy();
    await fireEvent.press(screen.getByText('Wake me before Tenafly'));
    expect(router.push).toHaveBeenCalledWith('/alarm');
  });

  it('leaves out the backup when there is none', async () => {
    await saveArmedTrip(trip({ backupAt: undefined }));
    await render(<MyAlarms />);
    await flush();
    expect(screen.getByText('Rings 1 mi away')).toBeTruthy();
  });

  it('asks before cancelling; Keep leaves the alarm alone', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await saveArmedTrip(trip());
    await render(<MyAlarms />);
    await flush();
    await fireEvent.press(screen.getByText('Cancel'));
    expect(alert).toHaveBeenCalledWith('Cancel this alarm?', 'Tenafly', expect.any(Array));
    const buttons = alert.mock.calls[0][2]!;
    expect(buttons[0]).toMatchObject({ text: 'Keep', style: 'cancel' });
    expect(disarm).not.toHaveBeenCalled();
    buttons[1].onPress!();
    expect(showToast).toHaveBeenCalledWith('Alarm cancelled');
    expect(disarm).toHaveBeenCalled();
  });

  it('edits in place', async () => {
    await saveArmedTrip(trip());
    await render(<MyAlarms />);
    await flush();
    await fireEvent.press(screen.getByText('Edit'));
    expect(screen.getByText('Ring when the bus is within')).toBeTruthy();
    await fireEvent.press(screen.getByText('Save'));
    await flush();
    expect(updateAlarm).toHaveBeenCalledWith({ radius: MILE, backupMin: 5 });
    expect(screen.getByText('Edit')).toBeTruthy();
  });

  it('follows the alarm as it is set, rings or is cancelled, and unsubscribes on unmount', async () => {
    const { unmount } = await render(<MyAlarms />);
    await flush();
    await act(async () => emit(trip({ name: 'Englewood' })));
    expect(screen.getByText('Wake me before Englewood')).toBeTruthy();
    await act(async () => emit(null));
    expect(screen.getByText(/No alarm set/)).toBeTruthy();
    await unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });
});
