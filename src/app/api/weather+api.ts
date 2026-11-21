// GET /api/weather?lat=40.93&lon=-73.96 — today's sky and the hourly chance of rain there.
// Proxied so the weather services see one identified client, and so a failing service falls back to the other.
import { forecastAt } from '@/server/weather';

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const lat = Number(params.get('lat') || NaN);
  const lon = Number(params.get('lon') || NaN);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return Response.json({ error: 'lat and lon are required' }, { status: 400 });
  }
  try {
    const forecast = await forecastAt(lat, lon);
    return Response.json(forecast, { headers: { 'Cache-Control': 'public, max-age=1800' } });
  } catch (e) {
    console.error('weather: both services failed', e);
    return Response.json({ error: 'Weather unavailable', source: 'weather' }, { status: 502 });
  }
}
