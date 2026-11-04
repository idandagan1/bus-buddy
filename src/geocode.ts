import * as Location from 'expo-location';

// First match for a free-text place, using the phone's geocoder.
export async function geocode(query: string): Promise<{ latitude: number; longitude: number } | null> {
  const results = await Location.geocodeAsync(query).catch(() => []);
  return results.length ? { latitude: results[0].latitude, longitude: results[0].longitude } : null;
}
