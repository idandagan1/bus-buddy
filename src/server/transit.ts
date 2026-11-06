// One entry point for every carrier. Stop and journey ids carry their carrier's prefix
// (NJ Transit ids start with `njt:`), so each call goes to whichever carrier owns them.
// `site` is this server's own origin: NJ Transit's schedule is read from static files it serves.
import type { Advisory, Stop, Trip, TripStatus } from '@/types';
import * as coachusa from './coachusa';
import * as njtransit from './njtransit';

const isNjt = (id: string) => id.startsWith(njtransit.ID_PREFIX);

export async function searchStops(site: string, query: string, origin?: string): Promise<Stop[]> {
  if (origin) return isNjt(origin) ? njtransit.searchStops(site, query, origin) : coachusa.searchStops(query, origin);
  // NJ Transit is optional: if its files are unavailable, Coach USA results still come back.
  const [coach, njt] = await Promise.all([coachusa.searchStops(query), njtransit.searchStops(site, query).catch(() => [])]);
  return [...coach, ...njt];
}

// A route's two stops always belong to the same carrier: stop search only offers destinations reachable from the origin.
export function getTrips(site: string, from: string, to: string, date: string): Promise<Trip[]> {
  return isNjt(from) ? njtransit.getTrips(site, from, to, date) : coachusa.getTrips(from, to, date);
}

export function getStatus(journeyId: string, date: string): Promise<TripStatus | null> {
  return isNjt(journeyId) ? njtransit.getStatus(journeyId, date) : coachusa.getStatus(journeyId, date);
}

export function getAdvisories(carrier: string, fromZone: string | null, toZone: string | null): Promise<Advisory[]> {
  return carrier === njtransit.CARRIER_CODE ? njtransit.getAdvisories(fromZone) : coachusa.getAdvisories(carrier, fromZone, toZone);
}
