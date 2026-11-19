// Picking which buses of a saved route to show: the 166 runs as a local (166), an I-95 express (166X) and a
// Turnpike express (166T) between the same stops, from different gates at Port Authority, and riders usually
// want one of them.
import type { SavedRoute, Trip } from './types';

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
