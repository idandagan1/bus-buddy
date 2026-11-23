// Live traffic incidents on the next bus's way: matched to the stretch of road between where the rider gets on and
// off, using the stops the trip passes. Like the weather, a nicety: failures show nothing.
import { useEffect, useState } from 'react';
import { track } from './analytics';
import type { TrafficIncident, Trip } from './types';

const TTL_MS = 20 * 60 * 1000;
// How close to the bus's way an incident must be (buses follow the roads between their stops; this absorbs the
// corners a straight line between stops cuts).
export const NEAR_M = 250;

let cache: { at: number; incidents: Promise<TrafficIncident[] | null> } | null = null;

export function loadIncidents(): Promise<TrafficIncident[] | null> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.incidents;
  // A failure is logged for us and never shown: riders just see no traffic notes.
  const failed = (reason: string, status?: number) => {
    track('load_failed', { what: 'traffic', reason, ...(status ? { status } : {}) });
    return null;
  };
  const incidents = fetch('/api/traffic')
    .then(async (res) => {
      if (!res.ok) return failed('server', res.status);
      const list: unknown = await res.json();
      return Array.isArray(list) ? (list as TrafficIncident[]) : failed('bad answer');
    })
    .catch(() => failed('offline'));
  const entry = { at: Date.now(), incidents };
  cache = entry;
  // A failure isn't kept, so the next look tries again.
  incidents.then((list) => {
    if (!list && cache === entry) cache = null;
  });
  return incidents;
}

export const clearIncidents = () => {
  cache = null;
};

export function useTraffic(enabled: boolean): TrafficIncident[] {
  const [incidents, setIncidents] = useState<TrafficIncident[]>([]);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    const load = () => loadIncidents().then((list) => live && list && setIncidents(list));
    load();
    const timer = setInterval(load, TTL_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [enabled]);
  return enabled ? incidents : [];
}

type Point = { latitude: number; longitude: number };

// Meters from p to the segment a–b, on a flat local map (fine at these distances).
export function toSegmentMeters(p: Point, a: Point, b: Point) {
  const k = Math.cos((p.latitude * Math.PI) / 180);
  const x = (q: Point) => q.longitude * 111320 * k;
  const y = (q: Point) => q.latitude * 110540;
  const [px, py, ax, ay, bx, by] = [x(p), y(p), x(a), y(a), x(b), y(b)];
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

const near = (a: Point, b: Point) => toSegmentMeters(a, b, b);

// The bus's way from the rider's stop to where they get off: the trip's stops between the two nearest ones, or
// just the two stops when the trip doesn't list its stops.
export function wayOf(trip: Pick<Trip, 'stops'>, from: Point, to: Point): Point[] {
  const stops = trip.stops.filter((s) => Number.isFinite(s.latitude) && Number.isFinite(s.longitude));
  if (stops.length < 2) return [from, to];
  const closest = (p: Point) => stops.reduce((best, s, i) => (near(p, s) < near(p, stops[best]) ? i : best), 0);
  const [i, j] = [closest(from), closest(to)];
  const way = stops.slice(Math.min(i, j), Math.max(i, j) + 1);
  return way.length > 1 ? way : [from, to];
}

// The incidents on a trip's way, the ones holding traffic up longest first.
export function incidentsOnTrip(incidents: TrafficIncident[], trip: Pick<Trip, 'stops'>, from: Point, to: Point): TrafficIncident[] {
  const way = wayOf(trip, from, to);
  const onWay = (lat: number, lon: number) =>
    way.some((a, i) => toSegmentMeters({ latitude: lat, longitude: lon }, a, way[Math.min(i + 1, way.length - 1)]) <= NEAR_M);
  return incidents
    .filter((inc) => inc.points.some(([lat, lon]) => onWay(lat, lon)))
    .sort((a, b) => (b.delayMin ?? 0) - (a.delayMin ?? 0));
}

const LABELS: Record<TrafficIncident['kind'], { icon: string; label: string; urgent: boolean }> = {
  accident: { icon: '🚨', label: 'Accident', urgent: true },
  'road-closed': { icon: '⛔', label: 'Road closed', urgent: true },
  flooding: { icon: '🌊', label: 'Flooding', urgent: true },
  danger: { icon: '⚠️', label: 'Hazard', urgent: false },
  ice: { icon: '🧊', label: 'Ice', urgent: false },
  'lane-closed': { icon: '🚧', label: 'Lane closed', urgent: false },
  'road-works': { icon: '🚧', label: 'Road works', urgent: false },
  'broken-down': { icon: '🚗', label: 'Broken-down vehicle', urgent: false },
};

export const isUrgent = (i: TrafficIncident) => LABELS[i.kind].urgent;

// "road closed", as a folded list of a card's notes counts it.
export const incidentLabel = (i: TrafficIncident) => LABELS[i.kind].label.toLowerCase();

// "🚨 Accident on US-9W near Clinton Ave · +6 min"
export function incidentLine(i: TrafficIncident) {
  const { icon, label } = LABELS[i.kind];
  const where = `${i.road ? ` on ${i.road}` : ''}${i.from ? ` near ${i.from}` : ''}`;
  return `${icon}  ${label}${where}${i.delayMin ? ` · +${i.delayMin} min` : ''}`;
}
