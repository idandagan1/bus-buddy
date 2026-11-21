// GET /api/traffic — live incidents along the riders' corridor (accidents, closures, major road works).
// One TomTom request serves everyone for 20 minutes, which keeps us inside its free monthly quota.
import { corridorIncidents } from '@/server/traffic';
import type { TrafficIncident } from '@/types';

const TTL_MS = 20 * 60 * 1000;
// Also kept in the server's memory, for requests the CDN doesn't answer.
let kept: { at: number; incidents: TrafficIncident[] } | null = null;
export const forgetIncidents = () => {
  kept = null;
};

export async function GET() {
  const key = process.env.TOMTOM_KEY;
  if (!key) return Response.json({ error: 'Traffic unavailable', source: 'traffic' }, { status: 503 });
  try {
    if (!kept || Date.now() - kept.at >= TTL_MS) kept = { at: Date.now(), incidents: await corridorIncidents(key) };
    const incidents = kept.incidents;
    return Response.json(incidents, { headers: { 'Cache-Control': 'public, max-age=600, s-maxage=1200' } });
  } catch (e) {
    console.error('traffic: tomtom failed', e);
    return Response.json({ error: 'Traffic unavailable', source: 'traffic' }, { status: 502 });
  }
}
