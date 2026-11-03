import AsyncStorage from '@react-native-async-storage/async-storage';

export type Destination = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
};

export type ArmedTrip = Destination & { radius: number; fired: boolean; backupAt?: number };

const DESTINATIONS_KEY = 'destinations';
const ARMED_KEY = 'armedTrip';

export async function loadDestinations(): Promise<Destination[]> {
  const raw = await AsyncStorage.getItem(DESTINATIONS_KEY);
  return raw ? JSON.parse(raw) : [];
}

export async function saveDestinations(list: Destination[]) {
  await AsyncStorage.setItem(DESTINATIONS_KEY, JSON.stringify(list));
}

export async function loadArmedTrip(): Promise<ArmedTrip | null> {
  const raw = await AsyncStorage.getItem(ARMED_KEY);
  return raw ? JSON.parse(raw) : null;
}

export async function saveArmedTrip(trip: ArmedTrip | null) {
  if (trip) await AsyncStorage.setItem(ARMED_KEY, JSON.stringify(trip));
  else await AsyncStorage.removeItem(ARMED_KEY);
}
