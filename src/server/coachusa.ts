// Unofficial coachusa.com API — see docs/coachusa-api.md.
import type { Advisory, LiveTime, Stop, Trip, TripStatus } from '@/types';

const BASE = 'https://api.prod.coachusa.com';
const CARRIERS = ['COM', 'LZR', 'NAE', 'OWL', 'RCK', 'HTL', 'SUB', 'VGB', 'WCC', 'WCL', 'WCS', 'MB', 'MBC'];
const HEADERS = { Origin: 'https://www.coachusa.com', Referer: 'https://www.coachusa.com/' };

type RawLocation = { latitude: string | number; longitude: string | number };
type RawStop = {
  id: string;
  stop: { name: string };
  place: { name: string; state: { code: string } };
  location: RawLocation;
};
type RawCall = {
  sequence: number;
  farezone: string | null;
  stop: { name: string; platform: string | null; location: RawLocation };
  arrival: { time: string; approximate: boolean } | null;
  departure: { time: string; approximate: boolean } | null;
};
type RawTrip = {
  id: string;
  carrier: { name: string; code: string };
  route: { longName: string };
  trip: { headsign: string };
  origin: RawCall;
  destination: RawCall;
  stops: RawCall[];
};

async function get<T>(path: string, params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams(params);
  if (path === '/journey/location') CARRIERS.forEach((c) => qs.append('carrierCode', c));
  const res = await fetch(`${BASE}${path}?${qs}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`coachusa ${path} → ${res.status}`);
  return res.json();
}

// The upstream `query` param doesn't filter (coachusa.com filters in the browser), so we filter here.
export async function searchStops(query: string, origin?: string): Promise<Stop[]> {
  const { results } = await get<{ results: RawStop[] }>('/journey/location', origin ? { origin } : { type: 'pickup' });
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = results.filter((r) => {
    const text = `${r.stop.name} ${r.place.name} ${r.place.state.code}`.toLowerCase();
    return words.every((w) => text.includes(w));
  });
  return matches.map((r) => ({
    id: r.id,
    name: r.stop.name,
    town: r.place.name,
    state: r.place.state.code,
    latitude: Number(r.location.latitude),
    longitude: Number(r.location.longitude),
  }));
}

const callTime = (c: RawCall) => (c.departure ?? c.arrival)!.time;
const serviceDay = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(iso));

export async function getTrips(origin: string, destination: string, date: string): Promise<Trip[]> {
  const { results } = await get<{ results: RawTrip[] }>('/journey', { origin, destination, dateFrom: date });
  return results
    .map((t) => ({
      // Upstream ids repeat for the same trip on every day.
      id: `${t.id}:${callTime(t.origin)}`,
      journeyId: t.id,
      serviceDate: serviceDay(t.stops[0] ? callTime(t.stops[0]) : callTime(t.origin)),
      route: t.route.longName,
      carrier: t.carrier.name,
      carrierCode: t.carrier.code,
      fromZone: t.origin.farezone,
      toZone: t.destination.farezone,
      headsign: t.trip.headsign,
      gate: t.origin.stop.platform || null,
      departure: callTime(t.origin),
      arrival: (t.destination.arrival ?? t.destination.departure)!.time,
      approximate: Boolean(t.origin.departure?.approximate),
      stops: t.stops
        .filter((s) => s.sequence >= t.origin.sequence && s.sequence <= t.destination.sequence)
        .map((s) => ({
          name: s.stop.name,
          time: callTime(s),
          latitude: Number(s.stop.location.latitude),
          longitude: Number(s.stop.location.longitude),
        })),
    }))
    .sort((a, b) => a.departure.localeCompare(b.departure));
}

// Service advisories only ship inside coachusa.com's schedule pages (Next.js __NEXT_DATA__).
// The list is the same on every schedule page, so any valid one works; filtering happens below.
const ADVISORY_PAGE = 'https://www.coachusa.com/travel-option/SGlsbHNpZGUgQXZlICYgSGlnaHdvb2QgQXZl/2597283/0d01d5e7';
const ADVISORY_TTL_MS = 10 * 60 * 1000;

type RichNode = { nodeType: string; value?: string; content?: RichNode[] };
type RawAdvisory = {
  slug: string;
  heading: string;
  severity: string;
  scheduleSummary: { json: RichNode } | null;
  displayFromDate: string | null;
  displayUntilDate: string | null;
  displayRulesCollection: { items: { operator: string[]; originZone: string[]; destZone: string[] }[] };
};

const paragraphs = (doc: RichNode): string[] => {
  const text = (n: RichNode): string => n.value ?? (n.content ?? []).map(text).join('');
  return (doc.content ?? []).map(text).map((t) => t.trim()).filter(Boolean);
};

let advisoryCache: { at: number; items: RawAdvisory[] } | null = null;

async function allAdvisories(): Promise<RawAdvisory[]> {
  if (advisoryCache && Date.now() - advisoryCache.at < ADVISORY_TTL_MS) return advisoryCache.items;
  const html = await (await fetch(ADVISORY_PAGE)).text();
  const json = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s)?.[1];
  if (!json) throw new Error('coachusa advisories: page format changed');
  const items: RawAdvisory[] = JSON.parse(json).props.pageProps.serviceAdvisories ?? [];
  advisoryCache = { at: Date.now(), items };
  return items;
}

const matches = (list: string[], value: string | null) => list.includes('*') || (value != null && list.includes(value));

export async function getAdvisories(carrier: string, fromZone: string | null, toZone: string | null): Promise<Advisory[]> {
  const now = Date.now();
  return (await allAdvisories())
    .filter((a) => !a.displayFromDate || new Date(a.displayFromDate).getTime() <= now)
    .filter((a) => !a.displayUntilDate || new Date(a.displayUntilDate).getTime() >= now)
    .filter((a) =>
      a.displayRulesCollection.items.some(
        (r) => matches(r.operator, carrier) && matches(r.originZone, fromZone) && matches(r.destZone, toZone),
      ),
    )
    .map((a) => ({
      id: a.slug,
      heading: a.heading.trim(),
      severity: a.severity as Advisory['severity'],
      paragraphs: a.scheduleSummary ? paragraphs(a.scheduleSummary.json) : [],
      updated: a.displayFromDate,
    }));
}

type RawLiveCall = { arrivalTime: LiveTime; departureTime: LiveTime };
type RawStatus = {
  status: string;
  vehicleName?: string;
  origin: RawLiveCall;
  destination: RawLiveCall;
  vehiclePosition?: { latitude: number; longitude: number; speedMph?: number; lastUpdated?: string } | null;
  timeRetrieved?: string;
};

// Live trip status (actual/estimated times, bus position). Upstream caches for 60s.
export async function getStatus(journeyId: string, date: string): Promise<TripStatus> {
  const s = await get<RawStatus>(`/journey/${encodeURIComponent(journeyId)}/status`, { date });
  const p = s.vehiclePosition;
  return {
    state: s.status,
    vehicle: s.vehicleName ?? null,
    departure: s.origin.departureTime,
    arrival: s.destination.arrivalTime,
    position: p ? { latitude: p.latitude, longitude: p.longitude, speedMph: p.speedMph ?? null, updated: p.lastUpdated ?? null } : null,
    retrieved: s.timeRetrieved ?? null,
  };
}
