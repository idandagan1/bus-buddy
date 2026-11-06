// NJ Transit buses: schedules from the static files scripts/build-njt.mts makes out of NJ Transit's GTFS feed,
// live status, bus positions and alerts from its GTFS-realtime feeds.
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import type Long from 'long';
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

type Station = [id: string, name: string, lat: number, lon: number, stops: string, routes: string, codes: string];
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

// `code` is the stop number to show: the one searched for, else the station's first.
const toStop = (s: Station, code = s[6]?.split(' ')[0]): Stop => ({
  id: ID_PREFIX + s[0],
  name: s[1],
  town: '',
  state: '',
  latitude: s[2],
  longitude: s[3],
  carrier: CARRIER_CODE,
  code,
});

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
  // A number is the stop number on the sign at the stop: exact matches first, then numbers starting with it.
  if (/^\d+$/.test(query.trim())) {
    const n = query.trim();
    const hits = candidates.flatMap((s) => {
      const code = s[6]?.split(' ').find((c) => c.startsWith(n));
      return code ? [{ s, code }] : [];
    });
    hits.sort((a, b) => Number(b.code === n) - Number(a.code === n) || a.code.length - b.code.length || a.code.localeCompare(b.code));
    return hits.slice(0, MAX_RESULTS).map(({ s, code }) => toStop(s, code));
  }
  return candidates
    .filter((s) => words.every((w) => s[1].toLowerCase().includes(w)))
    .slice(0, MAX_RESULTS)
    .map((s) => toStop(s));
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
          journeyId: `${ID_PREFIX}${routeId}:${tripId}:${leg[0]}:${leg[1]}`,
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

// --- Live data: NJ Transit's GTFS-realtime feeds (developer API, credentials in NJT_USERNAME/NJT_PASSWORD) ---

const API = 'https://pcsdata.njtransit.com/api/GTFSG2';
// Tokens last about a day and minting them is rate-limited, so one is reused until close to that.
const TOKEN_TTL_MS = 20 * 60 * 60 * 1000;
// The feeds cover every NJ Transit bus (the trip updates are ~4 MB), so a server instance decodes each
// at most this often and shares it across requests.
const FEED_TTL_MS = 20 * 1000;
const ALERTS_TTL_MS = 5 * 60 * 1000;

let token: { value: Promise<string>; expires: number } | null = null;

function post(path: string, fields: Record<string, string>) {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.append(k, v);
  return fetch(`${API}/${path}`, { method: 'POST', body });
}

function getToken() {
  if (!token || token.expires < Date.now()) {
    const username = process.env.NJT_USERNAME;
    const password = process.env.NJT_PASSWORD;
    if (!username || !password) throw new Error('NJ Transit credentials are not set');
    const value = post('authenticateUser', { username, password })
      .then((res) => res.json())
      .then((json: { UserToken?: string }) => {
        if (!json.UserToken) throw new Error('NJ Transit login failed');
        return json.UserToken;
      });
    value.catch(() => (token = null));
    token = { value, expires: Date.now() + TOKEN_TTL_MS };
  }
  return token.value;
}

type Feed = GtfsRealtimeBindings.transit_realtime.FeedMessage;
const feeds = new Map<string, { at: number; feed: Promise<Feed> }>();

function getFeed(name: 'getTripUpdates' | 'getVehiclePositions' | 'getAlerts', ttl = FEED_TTL_MS) {
  const cached = feeds.get(name);
  if (cached && Date.now() - cached.at < ttl) return cached.feed;
  const feed = (async () => {
    let res = await post(name, { token: await getToken() });
    // An expired or revoked token: log in again once.
    if (res.status === 401 || res.status === 403) {
      token = null;
      res = await post(name, { token: await getToken() });
    }
    if (!res.ok) throw new Error(`njtransit ${name} → ${res.status}`);
    return GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(await res.arrayBuffer()));
  })();
  feed.catch(() => feeds.delete(name));
  feeds.set(name, { at: Date.now(), feed });
  return feed;
}

// Per decoded feed, its entities by trip id, so each status lookup is a map hit rather than a scan.
const byTrip = new WeakMap<Feed, Map<string, GtfsRealtimeBindings.transit_realtime.IFeedEntity>>();
function entityFor(feed: Feed, tripId: string) {
  let map = byTrip.get(feed);
  if (!map) {
    map = new Map();
    for (const e of feed.entity) {
      const id = (e.tripUpdate ?? e.vehicle)?.trip?.tripId;
      if (id) map.set(id, e);
    }
    byTrip.set(feed, map);
  }
  return map.get(tripId);
}

const { ScheduleRelationship: TripRel } = GtfsRealtimeBindings.transit_realtime.TripDescriptor;
const { ScheduleRelationship: StopRel } = GtfsRealtimeBindings.transit_realtime.TripUpdate.StopTimeUpdate;
const iso = (seconds: number | Long | null | undefined) => (seconds ? new Date(Number(seconds) * 1000).toISOString() : undefined);

// journeyId is njt:<route>:<trip>:<boarding index>:<alighting index> (indexes into the trip's stop pattern),
// so the live times are for the rider's own stops, not the whole trip's.
export async function getStatus(site: string, journeyId: string, date: string): Promise<TripStatus | null> {
  const [routeId, tripId, fromIdx, toIdx] = journeyId.slice(ID_PREFIX.length).split(':');
  const [file, updates, vehicles] = await Promise.all([loadRoute(site, routeId), getFeed('getTripUpdates'), getFeed('getVehiclePositions').catch(() => null)]);
  const trip = file.trips.find((t) => t[0] === tripId);
  const update = entityFor(updates, tripId)?.tripUpdate;
  if (!trip || !update) return null;

  const pattern = file.patterns[trip[1]];
  const times = [trip[4]];
  for (let k = 5; k < trip.length; k++) times.push(times[times.length - 1] + (trip[k] as number));
  const stopTimes = (update.stopTimeUpdate ?? []).filter((s) => s.scheduleRelationship !== StopRel.NO_DATA);
  const delay = update.delay ?? stopTimes[0]?.departure?.delay ?? stopTimes[0]?.arrival?.delay ?? 0;

  // A stop the feed still predicts is ahead of the bus; one it no longer lists, while later stops are listed,
  // has been passed — then the best guess for when is the schedule plus the bus's current delay.
  const live = (i: number, which: 'departure' | 'arrival') => {
    const scheduled = serviceTime(date, times[i]);
    const seq = i + 1;
    const stu = stopTimes.find((s) => s.stopId === pattern[i] || s.stopSequence === seq);
    if (stu?.scheduleRelationship === StopRel.SKIPPED) return { time: { scheduled }, skipped: true };
    const event = stu?.[which] ?? stu?.departure ?? stu?.arrival;
    if (event?.time) return { time: { scheduled, estimated: iso(event.time) } };
    const shifted = (seconds: number) => new Date(Date.parse(scheduled) + seconds * 1000).toISOString();
    if (stopTimes.length && stopTimes.every((s) => (s.stopSequence ?? 0) > seq)) return { time: { scheduled, actual: shifted(delay) } };
    // Terminals often have no prediction of their own: carry over the delay from the last predicted stop before.
    const before = stopTimes.filter((s) => (s.stopSequence ?? 0) < seq).at(-1);
    const beforeDelay = before?.arrival?.delay ?? before?.departure?.delay;
    return { time: beforeDelay == null ? { scheduled } : { scheduled, estimated: shifted(beforeDelay) } };
  };
  const from = live(Number(fromIdx), 'departure');
  const to = live(Number(toIdx), 'arrival');
  const canceled = update.trip.scheduleRelationship === TripRel.CANCELED || from.skipped || to.skipped;
  // Every stop passed: the feed keeps a finished trip briefly with nothing left to predict.
  const done = !update.stopTimeUpdate?.length;

  const vehicle = vehicles && entityFor(vehicles, tripId)?.vehicle;
  const p = vehicle?.position;
  return {
    state: canceled ? 'CANCELED' : done ? 'COMPLETED' : from.time.actual ? 'IN_PROGRESS' : 'SCHEDULED',
    vehicle: vehicle?.vehicle?.label || update.vehicle?.label || null,
    departure: from.time,
    arrival: to.time,
    position: p ? { latitude: p.latitude, longitude: p.longitude, speedMph: p.speed ? p.speed * 2.23694 : null, updated: iso(vehicle.timestamp) ?? null } : null,
    retrieved: iso(updates.header.timestamp) ?? null,
  };
}

// Active alerts for one route. Stop-only notices (each terminal's greeting) aren't about a trip, so they're skipped.
export async function getAdvisories(routeId: string | null): Promise<Advisory[]> {
  if (!routeId) return [];
  const feed = await getFeed('getAlerts', ALERTS_TTL_MS);
  const now = Date.now() / 1000;
  const seen = new Set<string>();
  const out: Advisory[] = [];
  for (const e of feed.entity) {
    const a = e.alert;
    if (!a || seen.has(e.id) || !a.informedEntity?.some((i) => i.routeId === routeId)) continue;
    if (a.activePeriod?.length && !a.activePeriod.some((p) => Number(p.start ?? 0) <= now && (!p.end || Number(p.end) >= now))) continue;
    seen.add(e.id);
    const text = a.descriptionText?.translation?.[0]?.text?.trim() || a.headerText?.translation?.[0]?.text?.trim() || '';
    if (!text) continue;
    const [first, ...rest] = text.split(/(?<=\.)\s+/);
    out.push({
      id: e.id,
      heading: first,
      severity: a.severityLevel === 4 ? 'high' : 'low',
      paragraphs: rest.length ? [rest.join(' ')] : [],
      updated: iso(a.activePeriod?.[0]?.start) ?? null,
    });
  }
  return out;
}
