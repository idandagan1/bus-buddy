import { getTrips } from '@/server/transit';

// GET /api/trips?from=stop-…&to=stop-…&date=YYYY-MM-DD — about a week of trips starting at date.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const date = url.searchParams.get('date');
  if (!from || !to || !date) return Response.json({ error: 'from, to and date are required' }, { status: 400 });
  const trips = await getTrips(url.origin, from, to, date);
  return Response.json(trips, { headers: { 'Cache-Control': 'public, max-age=300' } });
}
