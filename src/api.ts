import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useOnline } from '@/network';
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

// Thrown when the request never reached the server (no connection), as opposed to a server error.
export class OfflineError extends Error {
  constructor() {
    super('No internet connection');
  }
}

async function getJson<T>(url: string, failure: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new OfflineError();
  }
  if (!res.ok) throw new Error(failure);
  return res.json();
}

export function searchStops(q: string, origin?: string): Promise<Stop[]> {
  const qs = new URLSearchParams({ q });
  if (origin) qs.set('origin', origin);
  return getJson(`/api/stops?${qs}`, "Couldn't load stops from Coach USA");
}

const tripsCacheKey = (from: string, to: string) => `trips:${from}:${to}`;
type CachedTrips = { savedAt: number; trips: Trip[] };

export async function fetchTrips(from: string, to: string): Promise<Trip[]> {
  const trips = await getJson<Trip[]>(
    `/api/trips?${new URLSearchParams({ from, to, date: todayISO() })}`,
    "Couldn't load the schedule from Coach USA",
  );
  const cached: CachedTrips = { savedAt: Date.now(), trips };
  AsyncStorage.setItem(tripsCacheKey(from, to), JSON.stringify(cached)).catch(() => {});
  return trips;
}

async function readCachedTrips(key: string): Promise<CachedTrips | null> {
  const raw = await AsyncStorage.getItem(key).catch(() => null);
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? { savedAt: 0, trips: parsed } : parsed; // older builds cached a bare array
}

const REFRESH_MS = 5 * 60 * 1000;

type TripsState = {
  key: string;
  trips: Trip[] | null;
  error: string | null;
  offline: boolean;
  // Set while showing a saved copy because no fresh data has arrived yet.
  cachedAt: number | null;
};

// Cached schedule first, then fresh data; refetches every few minutes and when the connection returns.
export function useTrips(from: Stop, to: Stop) {
  const key = tripsCacheKey(from.id, to.id);
  const online = useOnline();
  // Tagged with the key so switching direction never shows the other direction's trips.
  const [state, setState] = useState<TripsState>({ key, trips: null, error: null, offline: false, cachedAt: null });

  const load = useCallback(async () => {
    try {
      const trips = await fetchTrips(from.id, to.id);
      setState({ key, trips, error: null, offline: false, cachedAt: null });
    } catch (e) {
      setState((s) => ({
        ...(s.key === key ? s : { trips: null, cachedAt: null }),
        key,
        error: (e as Error).message,
        offline: e instanceof OfflineError,
      }));
    }
  }, [from.id, to.id, key]);

  useEffect(() => {
    readCachedTrips(key).then(
      (cached) =>
        cached &&
        setState((s) => (s.key === key && s.trips ? s : { key, trips: cached.trips, error: null, offline: false, cachedAt: cached.savedAt || null })),
    );
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [key, load]);

  // Refetch the moment the connection comes back.
  const wasOnline = useRef(online);
  useEffect(() => {
    if (online && wasOnline.current === false) load();
    wasOnline.current = online;
  }, [online, load]);

  const current = state.key === key ? state : { trips: null, error: null, offline: false, cachedAt: null };
  return { ...current, offline: current.offline || online === false, reload: load };
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
