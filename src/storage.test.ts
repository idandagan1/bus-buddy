import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadArmedTrip, saveArmedTrip, type ArmedTrip } from './storage';

const trip: ArmedTrip = {
  id: 't1',
  name: 'Tenafly',
  latitude: 40.925,
  longitude: -73.964,
  path: [{ latitude: 40.757, longitude: -73.99 }],
  radius: 1609,
  dueAt: 1763600000000,
  backupMin: 5,
};

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('armed trip', () => {
  it('is null when no alarm is set', async () => {
    await expect(loadArmedTrip()).resolves.toBeNull();
  });

  it('reads back what was saved', async () => {
    await saveArmedTrip(trip);
    await expect(loadArmedTrip()).resolves.toEqual(trip);
  });

  it('reads an alarm saved by older builds without a route or due time', async () => {
    const old = { id: 't0', name: 'Tenafly', latitude: 40.925, longitude: -73.964, radius: 1000, fired: true };
    await AsyncStorage.setItem('armedTrip', JSON.stringify(old));
    await expect(loadArmedTrip()).resolves.toEqual(old);
  });

  it('clears the alarm when saved as null', async () => {
    await saveArmedTrip(trip);
    await saveArmedTrip(null);
    await expect(loadArmedTrip()).resolves.toBeNull();
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('armedTrip');
  });

  it('treats a corrupt saved alarm as none', async () => {
    await AsyncStorage.setItem('armedTrip', '{"id":');
    await expect(loadArmedTrip()).resolves.toBeNull();
  });

  it('clearing with nothing armed is fine', async () => {
    await expect(saveArmedTrip(null)).resolves.toBeUndefined();
  });
});
