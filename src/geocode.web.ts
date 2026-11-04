// expo-location has no geocoder on web, so ask our server (which asks OpenStreetMap's Nominatim).
export async function geocode(query: string): Promise<{ latitude: number; longitude: number } | null> {
  try {
    const res = await fetch(`/api/geocode?${new URLSearchParams({ q: query })}`);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}
