// Road work notices from the towns of a route's stops, for the route card. Like the weather, a nicety: failures
// show nothing.
import { useEffect, useState } from 'react';
import { hasTownFeed, type RoadWork } from './townFeeds';
import type { Stop } from './types';

// The towns among these stops that publish notices, once each, in a stable order.
export const feedTowns = (stops: Pick<Stop, 'town'>[]) => [...new Set(stops.map((s) => s.town?.trim()).filter(hasTownFeed))].sort() as string[];

export function useRoadWork(stops: Pick<Stop, 'town'>[]): RoadWork[] {
  const towns = feedTowns(stops).join(',');
  const [state, setState] = useState<{ towns: string; notices: RoadWork[] } | null>(null);
  useEffect(() => {
    if (!towns) return;
    let live = true;
    fetch(`/api/roadwork?${new URLSearchParams({ towns })}`)
      .then((res) => (res.ok ? (res.json() as Promise<RoadWork[]>) : []))
      .then((notices) => live && setState({ towns, notices: Array.isArray(notices) ? notices : [] }))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [towns]);
  return state?.towns === towns ? state.notices : [];
}
