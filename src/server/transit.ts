// One entry point for every carrier. Stop and journey ids carry their carrier's prefix
// (NJ Transit ids start with `njt:`), so each call goes to whichever carrier owns them.
// `site` is this server's own origin: NJ Transit's schedule is read from static files it serves.
import type { Advisory, Stop, Trip, TripStatus } from '@/types';
import * as coachusa from './coachusa';
import * as njtransit from './njtransit';
import { distanceMeters, MIDTOWN } from '@/geo';
import { groupCorners, townFinder } from './towns';

const isNjt = (id: string) => id.startsWith(njtransit.ID_PREFIX);

// NJ Transit stops take their towns from Coach USA's (towns.ts); if Coach USA is down they just go without.
const finders = new WeakMap<Stop[], ReturnType<typeof townFinder>>();
const njtTowns = () =>
  coachusa
    .allStops()
    .then((stops) => {
      let find = finders.get(stops);
      if (!find) finders.set(stops, (find = townFinder(stops)));
      return find;
    })
    .catch(() => undefined);

export async function searchStops(site: string, query: string, origin?: string): Promise<Stop[]> {
  if (origin) return isNjt(origin) ? njtransit.searchStops(site, query, origin, await njtTowns()) : coachusa.searchStops(query, origin);
  // NJ Transit is optional: if its files are unavailable, Coach USA results still come back.
  const [found, townOf] = await Promise.all([coachusa.searchStops(query), njtTowns()]);
  // Coach USA runs as far as Milwaukee; riders here want the stops around New York first.
  const coach = found
    .map((s) => ({ s, m: distanceMeters(s, MIDTOWN) }))
    .sort((a, b) => a.m - b.m)
    .map(({ s }) => s);
  const njt = await njtransit.searchStops(site, query, undefined, townOf).catch(() => []);
  return groupCorners(coach, njt);
}

// The other carrier's stops at the same two places as a saved route (Coach USA's 20 and NJ Transit's 166 both
// run from Café Angelique's corner in Tenafly to Port Authority), so riders who take whichever bus comes first
// can see both. The boarding stop must be on the same corner; the far end can be across a terminal.
export const PARTNER_FROM_M = 250;
export const PARTNER_TO_M = 600;
type Place = { id: string; latitude: number; longitude: number };

export async function findPartner(site: string, from: Place, to: Place): Promise<{ from: Stop; to: Stop } | null> {
  if (isNjt(from.id)) {
    const near = (await coachusa.allStops())
      .map((s) => ({ s, m: distanceMeters(s, from) }))
      .filter(({ m }) => m <= PARTNER_FROM_M)
      .sort((a, b) => a.m - b.m);
    for (const { s } of near) {
      const reach = (await coachusa.searchStops('', s.id))
        .map((d) => ({ d, m: distanceMeters(d, to) }))
        .filter(({ m }) => m <= PARTNER_TO_M)
        .sort((a, b) => a.m - b.m)[0];
      if (reach) return { from: s, to: reach.d };
    }
    return null;
  }
  for (const s of await njtransit.stationsNear(site, from.latitude, from.longitude, PARTNER_FROM_M)) {
    const reach = await njtransit.reachableNear(site, s.id, to.latitude, to.longitude, PARTNER_TO_M);
    if (reach) return { from: { ...s, routes: reach.routes }, to: reach };
  }
  return null;
}

// A route's two stops always belong to the same carrier: stop search only offers destinations reachable from the origin.
export function getTrips(site: string, from: string, to: string, date: string): Promise<Trip[]> {
  return isNjt(from) ? njtransit.getTrips(site, from, to, date) : coachusa.getTrips(from, to, date);
}

export function getStatus(site: string, journeyId: string, date: string): Promise<TripStatus | null> {
  return isNjt(journeyId) ? njtransit.getStatus(site, journeyId, date) : coachusa.getStatus(journeyId, date);
}

export function getAdvisories(carrier: string, fromZone: string | null, toZone: string | null): Promise<Advisory[]> {
  // NJ Transit alerts are a nice-to-have; if its feed is down, the trip list shouldn't fail.
  return carrier === njtransit.CARRIER_CODE ? njtransit.getAdvisories(fromZone).catch(() => []) : coachusa.getAdvisories(carrier, fromZone, toZone);
}
