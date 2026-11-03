import { searchStops } from '@/server/coachusa';

// GET /api/stops?q=Tenafly[&origin=stop-…] — with origin, only destinations reachable from it.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const stops = await searchStops(url.searchParams.get('q') ?? '', url.searchParams.get('origin') ?? undefined);
  return Response.json(stops, { headers: { 'Cache-Control': 'public, max-age=3600' } });
}
