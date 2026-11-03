import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import type { Advisory, SavedRoute, Stop, Trip } from '@/types';

const TZ = 'America/New_York';

export const todayISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());

export const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });

export const formatDay = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric' });

export const dayKey = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(iso));

export function formatCountdown(iso: string, now: number) {
  const mins = Math.round((new Date(iso).getTime() - now) / 60000);
  if (mins <= 0) return 'now';
  if (mins < 60) return `in ${mins} min`;
  const h = Math.floor(mins / 60);
  if (h >= 24) return `in ${Math.floor(h / 24)}d ${h % 24}h`;
  return `in ${h}h ${mins % 60}m`;
}

export async function searchStops(q: string, origin?: string): Promise<Stop[]> {
  const qs = new URLSearchParams({ q });
  if (origin) qs.set('origin', origin);
  const res = await fetch(`/api/stops?${qs}`);
  if (!res.ok) throw new Error('Could not load stops');
  return res.json();
}

const tripsCacheKey = (from: string, to: string) => `trips:${from}:${to}`;

export async function fetchTrips(from: string, to: string): Promise<Trip[]> {
  const res = await fetch(`/api/trips?${new URLSearchParams({ from, to, date: todayISO() })}`);
  if (!res.ok) throw new Error('Could not load schedule');
  const trips: Trip[] = await res.json();
  AsyncStorage.setItem(tripsCacheKey(from, to), JSON.stringify(trips)).catch(() => {});
  return trips;
}

const REFRESH_MS = 5 * 60 * 1000;

// Cached schedule first, then fresh data; refetches every few minutes while mounted.
export function useTrips(from: Stop, to: Stop) {
  const key = tripsCacheKey(from.id, to.id);
  // Tagged with the key so switching direction never shows the other direction's trips.
  const [state, setState] = useState<{ key: string; trips: Trip[] | null; error: string | null }>({
    key,
    trips: null,
    error: null,
  });

  const load = useCallback(async () => {
    try {
      const trips = await fetchTrips(from.id, to.id);
      setState({ key, trips, error: null });
    } catch (e) {
      setState((s) => ({ key, trips: s.key === key ? s.trips : null, error: (e as Error).message }));
    }
  }, [from.id, to.id, key]);

  useEffect(() => {
    AsyncStorage.getItem(key)
      .then((raw) => raw && setState((s) => (s.key === key && s.trips ? s : { key, trips: JSON.parse(raw), error: null })))
      .catch(() => {});
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [key, load]);

  const current = state.key === key ? state : { trips: null, error: null };
  return { trips: current.trips, error: current.error, reload: load };
}

export function useNow(intervalMs = 30000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

const ROUTES_KEY = 'savedRoutes';

export async function loadRoutes(): Promise<SavedRoute[]> {
  const raw = await AsyncStorage.getItem(ROUTES_KEY);
  return raw ? JSON.parse(raw) : [];
}

export async function saveRoutes(routes: SavedRoute[]) {
  await AsyncStorage.setItem(ROUTES_KEY, JSON.stringify(routes));
}

// Active service alerts for the carrier and fare zones of a route's trips.
export function useAdvisories(trips: Trip[] | null) {
  const first = trips?.[0];
  const qs = first
    ? new URLSearchParams({ carrier: first.carrierCode, fromZone: first.fromZone ?? '', toZone: first.toZone ?? '' }).toString()
    : null;
  const [state, setState] = useState<{ qs: string; advisories: Advisory[] } | null>(null);

  useEffect(() => {
    if (!qs) return;
    const load = () =>
      fetch(`/api/advisories?${qs}`)
        .then((res) => (res.ok ? res.json() : []))
        .then((advisories: Advisory[]) => setState({ qs, advisories }))
        .catch(() => {});
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [qs]);

  return state?.qs === qs ? state.advisories : [];
}
