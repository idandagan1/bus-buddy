import { useEffect, useState } from 'react';
import type { LiveTime, Trip, TripStatus } from '@/types';

const POLL_MS = 30 * 1000;
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
    return () => {
      cancelled = true;
      clearInterval(timer);
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
  tone: 'good' | 'warn' | 'bad' | 'info';
  live: boolean;
  departure: string; // best-known departure time (actual > estimated > scheduled)
  arrival: string;
  arrivalDelayMin: number | null;
  vehicle: string | null;
};

// Turns a raw status into the one-line summary shown on trip cards, or null if there is nothing live yet.
export function summarize(status: TripStatus | null | undefined): LiveSummary | null {
  if (!status) return null;
  const departure = status.departure.actual ?? status.departure.estimated ?? status.departure.scheduled;
  const arrival = status.arrival.actual ?? status.arrival.estimated ?? status.arrival.scheduled;

  if (/CANCEL/i.test(status.state)) {
    return { text: 'Canceled', tone: 'bad', live: false, departure, arrival, arrivalDelayMin: null, vehicle: status.vehicle };
  }

  const departed = minutesOff(status.departure, 'actual');
  const departEst = minutesOff(status.departure, 'estimated');
  const arrived = minutesOff(status.arrival, 'actual');
  const arriveEst = minutesOff(status.arrival, 'estimated');
  const arrivalDelayMin = arrived ?? arriveEst;
  if (departed === null && departEst === null && arrivalDelayMin === null) return null;

  // One short phrase for the stage the bus is in; "On time" when nothing is off.
  let text: string;
  if (arrived !== null) text = arrived === 0 ? 'Arrived on time' : `Arrived ${describeOffset(arrived)}`;
  else if (departed !== null) text = !arriveEst ? 'On time' : `Arriving ${describeOffset(arriveEst)}`;
  else text = !departEst ? 'On time' : `Leaving ${describeOffset(departEst)}`;

  const worst = Math.max(departed ?? departEst ?? 0, arrivalDelayMin ?? 0);
  const tone = worst >= 10 ? 'bad' : worst >= 3 ? 'warn' : 'good';
  const live = /IN_PROGRESS/i.test(status.state) || departEst !== null;
  return { text, tone, live, departure, arrival, arrivalDelayMin, vehicle: status.vehicle };
}
