// Picking which buses of a saved route to show: the 166 runs as a local (166), an I-95 express (166X) and a
// Turnpike express (166T) between the same stops, from different gates at Port Authority, and riders usually
// want one of them.
import type { Leg, SavedRoute, Trip } from './types';

const byNumber = (a: string, b: string) => parseInt(a) - parseInt(b) || a.localeCompare(b);

// The routes to choose from: every one the trips run under, plus any already chosen that isn't running in the
// trips loaded (so it can still be unchosen). Nothing to choose when there's only one.
export function routeChoices(trips: Trip[] | null | undefined, only: string[] | undefined) {
  const routes = new Set([...(trips ?? []).map((t) => t.route), ...(only ?? [])]);
  return routes.size > 1 ? [...routes].sort(byNumber) : [];
}

// The trips the rider chose to see; null stays null (still loading).
export function chosenTrips(trips: Trip[] | null, route: Pick<SavedRoute, 'only'>) {
  return trips && route.only?.length ? trips.filter((t) => route.only!.includes(t.route)) : trips;
}

// Tapping a chip: adds or removes that route; `null` ("All") clears the choice. Choosing every route is the
// same as choosing none.
export function toggleRoute(only: string[] | undefined, route: string | null, choices: string[]) {
  if (route === null) return undefined;
  const next = only?.includes(route) ? only.filter((r) => r !== route) : [...(only ?? []), route].sort(byNumber);
  return next.length && next.length < choices.length ? next : undefined;
}

// How a bus is labeled wherever routes mix: NJ Transit's variants spelled out (the 166X and 166T expresses
// skip most stops the 166 local makes), Coach USA's routes marked as Coach. `routes` is every route showing.
export type RouteKind = 'express' | 'turnpike' | 'local' | 'coach' | 'plain';

export function routeLabel(route: string, carrierCode: string, routes: string[]): { label: string; kind: RouteKind } {
  if (carrierCode !== 'NJT') return { label: `Coach ${route}`, kind: 'coach' };
  if (/\dX$/.test(route)) return { label: `${route} Express`, kind: 'express' };
  if (/\dT$/.test(route)) return { label: `${route} Turnpike`, kind: 'turnpike' };
  const hasExpress = routes.some((r) => r !== route && r.startsWith(route) && /^[XT]$/.test(r.slice(route.length)));
  return hasExpress ? { label: `${route} Local`, kind: 'local' } : { label: route, kind: 'plain' };
}

// The dashed chip offering the other carrier's buses from the same corner: its lines when known (NJ Transit's
// stops list them), otherwise just its name.
export function offerLabel(leg: Leg) {
  if (leg.from.carrier !== 'NJT') return '+ Coach USA';
  return leg.to.routes?.length ? `+ ${leg.to.routes.join(' / ')} NJT` : '+ NJ Transit';
}
