import { getStatus } from '@/server/coachusa';
import type { TripStatus } from '@/types';

const MAX_TRIPS = 12;

// GET /api/status?trips=<journeyId>@<YYYY-MM-DD>,… → { [journeyId@date]: TripStatus | null }
export async function GET(request: Request) {
  const keys = (new URL(request.url).searchParams.get('trips') ?? '').split(',').filter(Boolean).slice(0, MAX_TRIPS);
  const entries = await Promise.all(
    keys.map(async (key): Promise<[string, TripStatus | null]> => {
      const [journeyId, date] = key.split('@');
      return [key, await getStatus(journeyId, date).catch(() => null)];
    }),
  );
  return Response.json(Object.fromEntries(entries), { headers: { 'Cache-Control': 'public, max-age=30' } });
}
