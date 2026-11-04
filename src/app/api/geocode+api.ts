// GET /api/geocode?q=Main St, Tenafly NJ — first OpenStreetMap match, or null.
// Proxied so every request carries an identifying User-Agent, as Nominatim's usage policy asks.
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get('q')?.trim();
  if (!q) return Response.json(null);
  const url = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({ q, format: 'jsonv2', limit: '1', countrycodes: 'us' })}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'BusBuddy/1.0 (bus-buddy web app)' } });
  if (!res.ok) return Response.json({ error: 'Geocoding failed' }, { status: 502 });
  const [hit] = (await res.json()) as { lat: string; lon: string }[];
  const place = hit ? { latitude: Number(hit.lat), longitude: Number(hit.lon) } : null;
  return Response.json(place, { headers: { 'Cache-Control': 'public, max-age=86400' } });
}
