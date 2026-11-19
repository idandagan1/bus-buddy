// A saved route's buses: its own carrier's, plus the other carrier's from the same corner when the rider added
// them (route.also), merged into one list.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { findPartner, useTrips } from './api';
import type { Leg, SavedRoute, Trip } from './types';

// By departure; of two leaving together, the one that gets there first.
export function mergeTrips(a: Trip[] | null, b: Trip[] | null): Trip[] | null {
  if (!b) return a;
  if (!a) return b;
  return [...a, ...b].sort((x, y) => Date.parse(x.departure) - Date.parse(y.departure) || Date.parse(x.arrival) - Date.parse(y.arrival));
}

export function useRouteTrips(route: SavedRoute, reversed: boolean) {
  const main = useTrips(reversed ? route.to : route.from, reversed ? route.from : route.to);
  const also = route.also;
  const extra = useTrips(also ? (reversed ? also.to : also.from) : null, also ? (reversed ? also.from : also.to) : null);
  const extraTrips = also ? extra.trips : null;
  const trips = useMemo(() => mergeTrips(main.trips, extraTrips), [main.trips, extraTrips]);
  const { reload: reloadMain } = main;
  const { reload: reloadExtra } = extra;
  const reload = useCallback(() => {
    reloadMain();
    reloadExtra();
  }, [reloadMain, reloadExtra]);
  return {
    ...main,
    trips,
    // Either carrier's schedule is enough to show; an error only matters when there's nothing at all.
    error: trips ? null : (main.error ?? (also ? extra.error : null)),
    // Each carrier's trips on their own, for its service alerts.
    legs: [main.trips, extraTrips] as const,
    reload,
  };
}

// Looked up once per pair of stops for the app's lifetime.
const partners = new Map<string, Promise<Leg | null>>();

// The other carrier's stops at the same corner, offered on the route card; undefined while looking.
export function usePartner(route: SavedRoute) {
  const key = `${route.from.id}>${route.to.id}`;
  const [found, setFound] = useState<{ key: string; leg: Leg | null } | null>(null);
  useEffect(() => {
    if (route.also) return;
    let lookup = partners.get(key);
    if (!lookup) {
      lookup = findPartner(route.from, route.to).catch(() => null);
      partners.set(key, lookup);
    }
    let live = true;
    lookup.then((leg) => live && setFound({ key, leg }));
    return () => {
      live = false;
    };
  }, [key, route.also, route.from, route.to]);
  return found?.key === key ? found.leg : undefined;
}
