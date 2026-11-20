import AsyncStorage from '@react-native-async-storage/async-storage';

export type Destination = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  // The trip's stops in order, for the route sketch on the sleep screen.
  path?: { latitude: number; longitude: number }[];
};

// dueAt: when the bus is due at the stop (live delay included), so the backup can be moved later.
// armedAt: when it was set, so an alarm without a due time still stops tracking eventually.
// fired: only on trips saved by older builds, which kept a rung alarm until it was stopped.
export type ArmedTrip = Destination & { radius: number; fired?: boolean; dueAt?: number; backupMin?: number; backupAt?: number; armedAt?: number };

export type AlarmOptions = { radius: number; backupMin: number };

const ARMED_KEY = 'armedTrip';

export async function loadArmedTrip(): Promise<ArmedTrip | null> {
  const raw = await AsyncStorage.getItem(ARMED_KEY);
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function saveArmedTrip(trip: ArmedTrip | null) {
  if (trip) await AsyncStorage.setItem(ARMED_KEY, JSON.stringify(trip));
  else await AsyncStorage.removeItem(ARMED_KEY);
}
