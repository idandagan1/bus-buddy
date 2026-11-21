// Live traffic incidents from TomTom along our riders' corridor: Northern Bergen County down through the George
// Washington Bridge to Midtown. TomTom's free tier allows 2,500 requests a month, so the whole corridor is asked
// for at once and shared by everyone (the API route caches it for 20 minutes).
import type { TrafficIncident } from '@/types';

// minLon,minLat,maxLon,maxLat: Closter and Demarest in the north to the Lincoln Tunnel and Port Authority in the
// south (about 430 km², under TomTom's 10,000 km² limit).
export const CORRIDOR = '-74.06,40.74,-73.90,41.03';

const FIELDS =
  '{incidents{geometry{type,coordinates},properties{id,iconCategory,magnitudeOfDelay,events{description},from,to,delay,roadNumbers,endTime}}}';

// TomTom's incident kinds worth a rider's attention, by its iconCategory.
const KINDS: Record<number, TrafficIncident['kind']> = {
  1: 'accident',
  3: 'danger',
  5: 'ice',
  7: 'lane-closed',
  8: 'road-closed',
  9: 'road-works',
  11: 'flooding',
  14: 'broken-down',
};
// Always worth showing, however small TomTom rates the delay.
const ALWAYS = new Set<TrafficIncident['kind']>(['accident', 'road-closed', 'flooding']);

type Raw = {
  geometry?: { type?: string; coordinates?: unknown };
  properties?: {
    id?: string;
    iconCategory?: number;
    magnitudeOfDelay?: number;
    events?: { description?: string }[];
    from?: string;
    to?: string;
    delay?: number | null;
    roadNumbers?: string[];
    endTime?: string | null;
  };
};

// [lat, lon] points along an incident, at most every few points of a long one (enough to match a bus's path).
function pointsOf(geometry: Raw['geometry']): [number, number][] {
  const c = geometry?.coordinates;
  const raw = geometry?.type === 'Point' ? [c] : geometry?.type === 'LineString' && Array.isArray(c) ? c : [];
  const points = (raw as unknown[]).filter(
    (p): p is [number, number] => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]),
  );
  const step = Math.max(1, Math.ceil(points.length / 20));
  return points.filter((_, i) => i % step === 0 || i === points.length - 1).map(([lon, lat]) => [lat, lon]);
}

// Incidents a rider would care about: accidents, closures and flooding always; other hazards and road works only
// when TomTom expects a moderate or major delay.
export function toIncidents(body: { incidents?: Raw[] } | null): TrafficIncident[] {
  return (body?.incidents ?? []).flatMap((raw) => {
    const p = raw.properties ?? {};
    const kind = KINDS[p.iconCategory ?? -1];
    if (!kind || !p.id) return [];
    if (!ALWAYS.has(kind) && !(p.magnitudeOfDelay === 2 || p.magnitudeOfDelay === 3)) return [];
    const points = pointsOf(raw.geometry);
    if (!points.length) return [];
    return [
      {
        id: p.id,
        kind,
        what: p.events?.[0]?.description?.trim() || null,
        road: p.roadNumbers?.[0] || null,
        from: p.from || null,
        to: p.to || null,
        delayMin: p.delay && p.delay > 0 ? Math.round(p.delay / 60) : null,
        until: p.endTime || null,
        points,
      },
    ];
  });
}

export async function corridorIncidents(key: string): Promise<TrafficIncident[]> {
  const qs = new URLSearchParams({ key, bbox: CORRIDOR, fields: FIELDS, language: 'en-US', timeValidityFilter: 'present' });
  const res = await fetch(`https://api.tomtom.com/traffic/services/5/incidentDetails?${qs}`, { headers: { 'Accept-Encoding': 'gzip' } });
  if (!res.ok) throw new Error(`tomtom → ${res.status}`);
  return toIncidents(await res.json());
}
