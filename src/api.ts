import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useOnline } from '@/network';
import type { Advisory, Leg, SavedRoute, Stop, Trip } from '@/types';
import { track } from '@/analytics';

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

// A stalled request (weak cellular, a slow upstream) would otherwise keep screens loading indefinitely.
const REQUEST_TIMEOUT_MS = 15000;
// Server errors are often momentary (the host's CPU limit, a blip upstream), so they get one quiet retry.
const RETRY_DELAY_MS = 1000;
const SOURCE_NAMES: Record<string, string> = { coachusa: 'Coach USA', njtransit: 'NJ Transit' };

// `what` names the data for the error message: "the schedule", "stops".
async function getJson<T>(url: string, what: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), REQUEST_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, { signal: abort.signal });
    } catch {
      const timedOut = abort.signal.aborted;
      track('load_failed', { what, reason: timedOut ? 'timeout' : 'offline' });
      throw timedOut ? new Error(`Couldn't load ${what}: the request timed out.`) : new OfflineError();
    } finally {
      clearTimeout(timer);
    }
    if (res.ok) return res.json();
    if (res.status >= 500 && attempt === 0) {
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      continue;
    }
    // API routes say which upstream failed; anything else (no JSON body) is our own server.
    const body: { source?: string } | null = await res.json().catch(() => null);
    const name = body?.source && SOURCE_NAMES[body.source];
    track('load_failed', { what, reason: body?.source ?? 'server', status: res.status });
    throw new Error(name ? `Couldn't load ${what}: ${name} isn't responding.` : `Couldn't load ${what}: the Bus Buddy server had a hiccup.`);
  }
}

export function searchStops(q: string, origin?: string): Promise<Stop[]> {
  const qs = new URLSearchParams({ q });
  if (origin) qs.set('origin', origin);
  return getJson(`/api/stops?${qs}`, 'stops');
}

// The other carrier's stops at the same two places as a route, or null when it has none there.
export function findPartner(from: Stop, to: Stop): Promise<Leg | null> {
  const place = (s: Stop) => `${s.id},${s.latitude},${s.longitude}`;
  return getJson(`/api/partner?${new URLSearchParams({ from: place(from), to: place(to) })}`, 'nearby stops');
}

const tripsCacheKey = (from: string, to: string) => `trips:${from}:${to}`;
type CachedTrips = { savedAt: number; trips: Trip[] };

export async function fetchTrips(from: string, to: string): Promise<Trip[]> {
  const trips = await getJson<Trip[]>(
    `/api/trips?${new URLSearchParams({ from, to, date: todayISO() })}`,
    'the schedule',
  );
  const cached: CachedTrips = { savedAt: Date.now(), trips };
  AsyncStorage.setItem(tripsCacheKey(from, to), JSON.stringify(cached)).catch(() => {});
  return trips;
}

async function readCachedTrips(key: string): Promise<CachedTrips | null> {
  const raw = await AsyncStorage.getItem(key).catch(() => null);
  if (!raw) return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null; // a damaged copy is as good as none
  }
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
// With no stops (a route's other carrier, when it has none) it loads nothing.
export function useTrips(from: Stop | null, to: Stop | null) {
  const key = from && to ? tripsCacheKey(from.id, to.id) : '';
  const online = useOnline();
  // Tagged with the key so switching direction never shows the other direction's trips.
  const [state, setState] = useState<TripsState>({ key, trips: null, error: null, offline: false, cachedAt: null });

  const fromId = from?.id;
  const toId = to?.id;
  const load = useCallback(async () => {
    if (!fromId || !toId) return;
    try {
      const trips = await fetchTrips(fromId, toId);
      setState({ key, trips, error: null, offline: false, cachedAt: null });
    } catch (e) {
      setState((s) => ({
        ...(s.key === key ? s : { trips: null, cachedAt: null }),
        key,
        error: (e as Error).message,
        offline: e instanceof OfflineError,
      }));
    }
  }, [fromId, toId, key]);

  useEffect(() => {
    if (!key) return;
    readCachedTrips(key).then(
      (cached) =>
        cached &&
        // If the fetch already failed, the saved copy shows with that error still known.
        setState((s) =>
          s.key === key && s.trips
            ? s
            : { key, trips: cached.trips, error: s.key === key ? s.error : null, offline: s.key === key && s.offline, cachedAt: cached.savedAt || null },
        ),
    );
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [key, load]);

  // Refetch the moment the connection comes back.
  const wasOnline = useRef(online);
  useEffect(() => {
    if (key && online && wasOnline.current === false) load();
    wasOnline.current = online;
  }, [key, online, load]);

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
  try {
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
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
