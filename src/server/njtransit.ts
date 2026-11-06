// NJ Transit buses, from the static files scripts/build-njt.mts makes out of NJ Transit's public GTFS feed.
// Live status, vehicle positions and alerts need NJ Transit developer credentials (GTFS-realtime); until then
// trips show their schedule only.
import { distanceMeters } from '@/geo';
import type { Advisory, Stop, Trip, TripStatus } from '@/types';

export const ID_PREFIX = 'njt:';
export const CARRIER_CODE = 'NJT';
const CARRIER_NAME = 'NJ Transit';
const TZ = 'America/New_York';
// Local NJ Transit buses run often and stop every block, so a week of trips with every stop is several MB.
// Three days and a thinned stop list keep a response near Coach USA's size.
const DAYS = 3;
const MAX_TRIP_STOPS = 30;
// Stops this close to the chosen one also count (e.g. the other side of the street, for the ride back).
const NEARBY_M = 250;
// A busy stop (Port Authority) is served by hundreds of stations' routes; keep destination lists usable.
const MAX_RESULTS = 50;

type Station = [id: string, name: string, lat: number, lon: number, stops: string, routes: string];
type Index = { feedDate: string; services: Record<string, string[]>; routes: Record<string, string>; stations: Station[] };
// [trip id, pattern, service, headsign, first stop's minutes after midnight, ...minutes to each next stop]
type RouteTrip = [string, number, string, number, number, ...number[]];
type RouteFile = { stops: Record<string, [string, number, number]>; patterns: string[][]; headsigns: string[]; trips: RouteTrip[] };

// The files only change with a deploy, so a server instance can keep them for its whole life.
let index: Promise<Index> | null = null;
const routeFiles = new Map<string, Promise<RouteFile>>();

async function getJson<T>(origin: string, path: string): Promise<T> {
  const res = await fetch(`${origin}/njt/${path}`);
  if (!res.ok) throw new Error(`njtransit ${path} → ${res.status}`);
  return res.json();
}

function loadIndex(origin: string) {
  index ??= getJson<Index>(origin, 'index.json').catch((e) => {
    index = null;
    throw e;
  });
  return index;
}

function loadRoute(origin: string, id: string) {
  let file = routeFiles.get(id);
  if (!file) {
    file = getJson<RouteFile>(origin, `routes/${encodeURIComponent(id)}.json`);
    file.catch(() => routeFiles.delete(id));
    routeFiles.set(id, file);
  }
  return file;
}

const stationId = (id: string) => id.slice(ID_PREFIX.length);

const toStop = (s: Station): Stop => ({ id: ID_PREFIX + s[0], name: s[1], town: '', state: '', latitude: s[2], longitude: s[3], carrier: CARRIER_CODE });

export async function searchStops(origin: string, query: string, from?: string): Promise<Stop[]> {
  const { stations } = await loadIndex(origin);
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  let candidates = stations;
  if (from) {
    const start = stations.find((s) => s[0] === stationId(from));
    if (!start) return [];
    const routes = new Set(start[5].split(' '));
    candidates = stations.filter((s) => s !== start && s[5].split(' ').some((r) => routes.has(r)));
  } else if (!words.length) {
    return [];
  }
  return candidates
    .filter((s) => words.every((w) => s[1].toLowerCase().includes(w)))
    .slice(0, MAX_RESULTS)
    .map(toStop);
}

// GTFS times count from "noon minus 12 hours" on the service day, which keeps them right across DST changes.
// Offsets only change on the hour, so one lookup per hour covers every stop time in a request; the server's
// CPU budget per request is small, and formatting thousands of times is what used to blow it.
const offsetFormat = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'longOffset' });
const offsets = new Map<number, number>();
function offsetMinutes(at: Date) {
  const hour = Math.floor(at.getTime() / 3600000);
  let offset = offsets.get(hour);
  if (offset === undefined) {
    const name = offsetFormat.formatToParts(new Date(hour * 3600000)).find((p) => p.type === 'timeZoneName')!.value;
    const [, sign, h, m] = name.match(/GMT([+-])(\d\d):(\d\d)/) ?? ['', '+', '00', '00'];
    offset = (sign === '-' ? -1 : 1) * (Number(h) * 60 + Number(m));
    offsets.set(hour, offset);
  }
  return offset;
}

// When the service day's clock starts (noon local minus 12 h), per day.
const dayStarts = new Map<string, number>();
function dayStart(date: string) {
  let start = dayStarts.get(date);
  if (start === undefined) {
    const noonUtc = new Date(`${date}T12:00:00Z`);
    start = noonUtc.getTime() - offsetMinutes(noonUtc) * 60000 - 12 * 3600000;
    dayStarts.set(date, start);
  }
  return start;
}

// Trips share stop times, so each (day, minute) is formatted once. GTFS minutes can pass 24 h (after midnight).
const formatted = new Map<string, string[]>();
export function serviceTime(date: string, minutes: number) {
  let day = formatted.get(date);
  if (!day) formatted.set(date, (day = []));
  return (day[minutes] ??= formatServiceTime(date, minutes));
}

function formatServiceTime(date: string, minutes: number) {
  const at = new Date(dayStart(date) + minutes * 60000);
  const off = offsetMinutes(at);
  const wall = new Date(at.getTime() + off * 60000).toISOString().slice(0, 19);
  const abs = Math.abs(off);
  return `${wall}${off < 0 ? '-' : '+'}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

// The stops at and near a station.
function stopsNear(stations: Station[], station: Station) {
  const here = { latitude: station[2], longitude: station[3] };
  // A cheap box test first; the exact distance only for the handful of stations inside it.
  const dLat = NEARBY_M / 111000;
  const dLon = dLat / Math.cos((here.latitude * Math.PI) / 180);
  const near = stations.filter(
    (s) => Math.abs(s[2] - here.latitude) <= dLat && Math.abs(s[3] - here.longitude) <= dLon && distanceMeters(here, { latitude: s[2], longitude: s[3] }) <= NEARBY_M,
  );
  return { stops: new Set(near.flatMap((s) => s[4].split(' '))), routes: new Set(near.flatMap((s) => s[5].split(' '))) };
}

// Indexes of up to `max` stops between i and j, always both ends, spread evenly along the way.
export function thin(count: number, max: number) {
  if (count <= max) return Array.from({ length: count }, (_, k) => k);
  return Array.from({ length: max }, (_, k) => Math.round((k * (count - 1)) / (max - 1)));
}

const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

export async function getTrips(origin: string, from: string, to: string, date: string): Promise<Trip[]> {
  const idx = await loadIndex(origin);
  const start = idx.stations.find((s) => s[0] === stationId(from));
  const end = idx.stations.find((s) => s[0] === stationId(to));
  if (!start || !end) return [];
  const { stops: fromStops, routes: fromRoutes } = stopsNear(idx.stations, start);
  const { stops: toStops, routes: toRoutes } = stopsNear(idx.stations, end);
  const routeIds = [...fromRoutes].filter((r) => toRoutes.has(r));
  const days = Array.from({ length: DAYS }, (_, i) => addDays(date, i));

  const trips: Trip[] = [];
  for (const [routeId, file] of await Promise.all(routeIds.map(async (r) => [r, await loadRoute(origin, r)] as const))) {
    // Where each stop pattern boards and leaves: the pair of stops (boarding before alighting) closest to the
    // chosen ones, so the rider's exact stops win over merely nearby ones whenever the bus serves them.
    const off = (s: string, st: Station) => distanceMeters({ latitude: file.stops[s][1], longitude: file.stops[s][2] }, { latitude: st[2], longitude: st[3] });
    const legs = file.patterns.map((stops) => {
      let best: [number, number] | null = null;
      let bestCost = Infinity;
      stops.forEach((s, i) => {
        if (!fromStops.has(s)) return;
        for (let j = i + 1; j < stops.length; j++) {
          if (!toStops.has(stops[j])) continue;
          const cost = off(s, start) + off(stops[j], end);
          if (cost < bestCost) {
            best = [i, j];
            bestCost = cost;
          }
        }
      });
      return best;
    });
    for (const trip of file.trips) {
      const [tripId, pattern, service, headsign] = trip;
      const leg = legs[pattern];
      const runs = idx.services[service] ?? [];
      // Most trips either skip these stops or run on other days (weekday vs weekend schedules).
      if (!leg || !days.some((d) => runs.includes(d))) continue;
      const times = [trip[4]];
      for (let k = 5; k < trip.length; k++) times.push(times[times.length - 1] + (trip[k] as number));
      const keep = thin(leg[1] - leg[0] + 1, MAX_TRIP_STOPS);
      const stops = keep.map((k) => file.patterns[pattern][leg[0] + k]);
      for (const day of days) {
        if (!runs.includes(day)) continue;
        const at = (k: number) => serviceTime(day, times[leg[0] + keep[k]]);
        trips.push({
          id: `${ID_PREFIX}${tripId}:${day}`,
          journeyId: ID_PREFIX + tripId,
          serviceDate: day,
          route: idx.routes[routeId] ?? routeId,
          carrier: CARRIER_NAME,
          carrierCode: CARRIER_CODE,
          fromZone: routeId,
          toZone: null,
          headsign: file.headsigns[headsign],
          gate: null,
          departure: at(0),
          arrival: at(stops.length - 1),
          approximate: false,
          stops: stops.map((s, k) => ({ name: file.stops[s][0], time: at(k), latitude: file.stops[s][1], longitude: file.stops[s][2] })),
        });
      }
    }
  }
  // A day's last buses can leave after midnight; without the next day's own trips they'd make a near-empty day.
  const lastDay = days[days.length - 1];
  return trips.filter((t) => t.departure.slice(0, 10) <= lastDay).sort((a, b) => Date.parse(a.departure) - Date.parse(b.departure));
}

// Needs NJ Transit's GTFS-realtime trip updates and vehicle positions (developer credentials pending).
export async function getStatus(_journeyId: string, _date: string): Promise<TripStatus | null> {
  return null;
}

// Needs NJ Transit's GTFS-realtime alerts feed (developer credentials pending).
export async function getAdvisories(_routeId: string | null): Promise<Advisory[]> {
  return [];
}
