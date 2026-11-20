import { arm, disarm, requestPermissions, subscribe, syncTracking, updateAlarm } from './alarm.web';

const tenafly = { id: 's', name: 'Tenafly', latitude: 40.92, longitude: -73.96 };

describe('alarm on web', () => {
  it('refuses permissions with a message pointing to the iPhone app', async () => {
    await expect(requestPermissions()).resolves.toBe('The wake-up alarm is only available in the iPhone app.');
  });

  it('every action is a harmless no-op', async () => {
    const fn = jest.fn();
    const unsubscribe = subscribe(fn);
    await expect(arm(tenafly, { radius: 1609, backupMin: 5 }, new Date())).resolves.toBeUndefined();
    await expect(updateAlarm({ radius: 1609, backupMin: 0 })).resolves.toBeUndefined();
    await expect(disarm()).resolves.toBeUndefined();
    await expect(syncTracking()).resolves.toBeUndefined();
    unsubscribe();
    expect(fn).not.toHaveBeenCalled();
  });
});
