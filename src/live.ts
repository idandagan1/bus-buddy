import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { formatTime } from '@/api';
import type { LiveTime, Trip, TripStatus } from '@/types';

// Coach USA refreshes live data about once a minute, so polling faster than this buys nothing.
const POLL_MS = 15 * 1000;
// Live status only exists around the trip itself.
const WINDOW_BEFORE_MS = 90 * 60 * 1000;
const WINDOW_AFTER_MS = 3 * 60 * 60 * 1000;

export const statusKey = (t: Trip) => `${t.journeyId}@${t.serviceDate}`;

function isLiveCandidate(t: Trip, now: number) {
  const dep = new Date(t.departure).getTime();
  const arr = new Date(t.arrival).getTime();
  return dep - now < WINDOW_BEFORE_MS && now - arr < WINDOW_AFTER_MS;
}

// Polls live status for trips that are about to leave or on the road. Keyed by statusKey().
export function useTripStatuses(trips: Trip[] | null | undefined, now: number) {
  const keys = (trips ?? []).filter((t) => t.journeyId && isLiveCandidate(t, now)).map(statusKey).slice(0, 12);
  const query = keys.join(',');
  const [statuses, setStatuses] = useState<Record<string, TripStatus | null>>({});

  useEffect(() => {
    if (!query) return;
    let cancelled = false;
    const load = () =>
      fetch(`/api/status?${new URLSearchParams({ trips: query })}`)
        .then((res) => (res.ok ? res.json() : {}))
        .then((next: Record<string, TripStatus | null>) => !cancelled && setStatuses((s) => ({ ...s, ...next })))
        .catch(() => {});
    load();
    const timer = setInterval(load, POLL_MS);
    // Timers pause in the background; catch up as soon as the app (or browser tab) is back.
    const sub = AppState.addEventListener('change', (state) => state === 'active' && load());
    return () => {
      cancelled = true;
      clearInterval(timer);
      sub.remove();
    };
  }, [query]);

  return statuses;
}

// Minutes off schedule; within a minute counts as on time.
const minutesOff = (t: LiveTime, which: 'actual' | 'estimated') => {
  const value = t[which];
  if (!value) return null;
  const min = Math.round((new Date(value).getTime() - new Date(t.scheduled).getTime()) / 60000);
  return Math.abs(min) <= 1 ? 0 : min;
};

const describeOffset = (min: number) => (min === 0 ? 'on time' : min > 0 ? `${min} min late` : `${-min} min early`);

export type LiveSummary = {
  text: string;
  tone: 'good' | 'warn' | 'bad' | 'info' | 'muted';
  stage: 'upcoming' | 'departed' | 'arrived' | 'canceled';
  live: boolean; // still to come and tracked: shown with a pulsing dot
  departure: string; // best-known departure time (actual > estimated > scheduled)
  arrival: string;
  arrivalDelayMin: number | null;
  vehicle: string | null;
};

// Upstream doesn't always report the actual arrival, so a ride this long past its arrival counts as done.
const ARRIVED_AFTER_MS = 10 * 60 * 1000;

// Turns a raw status into the one-line summary shown on trip cards, or null if there is nothing live yet.
export function summarize(status: TripStatus | null | undefined, now: number): LiveSummary | null {
  if (!status) return null;
  const departure = status.departure.actual ?? status.departure.estimated ?? status.departure.scheduled;
  const arrival = status.arrival.actual ?? status.arrival.estimated ?? status.arrival.scheduled;
  const base = { departure, arrival, vehicle: status.vehicle };

  if (/CANCEL/i.test(status.state)) {
    return { ...base, text: 'Canceled', tone: 'bad', stage: 'canceled', live: false, arrivalDelayMin: null };
  }

  const departed = minutesOff(status.departure, 'actual');
  const departEst = minutesOff(status.departure, 'estimated');
  const arrived = minutesOff(status.arrival, 'actual');
  const arriveEst = minutesOff(status.arrival, 'estimated');
  const arrivalDelayMin = arrived ?? arriveEst;
  const worst = Math.max(departed ?? departEst ?? 0, arrivalDelayMin ?? 0);
  const tone = worst >= 10 ? 'bad' : worst >= 3 ? 'warn' : 'good';

  if (arrived !== null || /COMPLETED/i.test(status.state) || new Date(arrival).getTime() + ARRIVED_AFTER_MS < now) {
    return { ...base, text: `Arrived ${formatTime(arrival)}`, tone: 'muted', stage: 'arrived', live: false, arrivalDelayMin };
  }

  // Not IN_PROGRESS: that starts when the bus leaves its first stop, which may be well before the rider's.
  if (departed !== null || new Date(departure).getTime() < now) {
    return { ...base, text: `Departed ${formatTime(departure)}`, tone, stage: 'departed', live: false, arrivalDelayMin };
  }

  if (departEst === null && arrivalDelayMin === null) return null;
  const text = !departEst ? 'On time' : `Leaving ${describeOffset(departEst)}`;
  return { ...base, text, tone, stage: 'upcoming', live: true, arrivalDelayMin };
}
