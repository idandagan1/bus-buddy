// Turns NJ Transit's public bus GTFS into small JSON files under public/njt/, because the full feed
// (~200 MB unzipped) is far too big to read inside a server request.
//
//   node scripts/build-njt.mts               # downloads the latest feed
//   node scripts/build-njt.mts bus_data.zip  # or uses a local copy
//
// Output (served as static files, fetched by src/server/njtransit.ts):
//   njt/index.json          services, route names, and stations (same-named stops grouped, e.g. Port Authority's many)
//                           as [id, name, lat, lon, "stop ids", "route ids"] — kept small, it's read on every search
//   njt/routes/<id>.json    that route's stops, stop patterns and trips, with stop times as minute deltas

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const FEED_URL = 'https://www.njtransit.com/bus_data.zip';
const OUT = join(import.meta.dirname, '..', 'public', 'njt');
// Same-named stops this close together are one place to a rider (different gates, sides of the street).
const STATION_RADIUS_M = 400;

async function feedZip(path: string | undefined, work: string) {
  if (path) return path;
  const res = await fetch(FEED_URL);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const zip = join(work, 'bus_data.zip');
  writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
  return zip;
}

// Minimal CSV: quoted fields may contain commas; GTFS feeds don't use embedded newlines.
function parseLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') (cur += '"'), i++;
      else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') out.push(cur), (cur = '');
    else cur += c;
  }
  out.push(cur);
  return out;
}

function* rows(dir: string, file: string): Generator<Record<string, string>> {
  const lines = readFileSync(join(dir, file), 'utf8').replace(/^﻿/, '').split(/\r?\n/);
  const header = parseLine(lines[0]);
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const cells = parseLine(lines[i]);
    yield Object.fromEntries(header.map((h, j) => [h, cells[j] ?? '']));
  }
}

const SMALL_WORDS = new Set(['at', 'of', 'and', 'via', 'to', 'the', 'on', 'in', 'from']);
// "RIVEREDGE RD AT TENAFLY RD" → "Riveredge Rd at Tenafly Rd"
const titleCase = (s: string) =>
  s
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w) ? w : w.replace(/(^|[-/(])([a-z])/g, (_, p, c) => p + c.toUpperCase())))
    .join(' ');

// "1 JERSEY CITY JOURNAL SQ VIA RIVER TERMINAL-Exact Fare" → "Jersey City Journal Sq via River Terminal"
const headsign = (raw: string, route: string) => titleCase(raw.replace(/-Exact Fare$/i, '').replace(new RegExp(`^${route}\\s+`), ''));

const minutes = (hms: string) => {
  const [h, m] = hms.split(':').map(Number);
  return h * 60 + m;
};

function distanceMeters(a: [number, number], b: [number, number]) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(toRad(b[0] - a[0]) / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(toRad(b[1] - a[1]) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

async function main() {
  const work = mkdtempSync(join(tmpdir(), 'njt-'));
  try {
    const zip = await feedZip(process.argv[2], work);
    const dir = join(work, 'gtfs');
    execFileSync('unzip', ['-q', '-o', zip, '-d', dir]);

    const services: Record<string, string[]> = {};
    for (const r of rows(dir, 'calendar_dates.txt')) {
      if (r.exception_type !== '1') continue;
      (services[r.service_id] ??= []).push(`${r.date.slice(0, 4)}-${r.date.slice(4, 6)}-${r.date.slice(6, 8)}`);
    }

    const routeNames: Record<string, string> = {};
    for (const r of rows(dir, 'routes.txt')) routeNames[r.route_id] = r.route_short_name || r.route_long_name;

    const stops: Record<string, [string, number, number]> = {};
    for (const r of rows(dir, 'stops.txt')) stops[r.stop_id] = [titleCase(r.stop_name), Number(r.stop_lat), Number(r.stop_lon)];

    type RawTrip = { route: string; service: string; headsign: string; calls: [number, string, number][] };
    const trips = new Map<string, RawTrip>();
    for (const r of rows(dir, 'trips.txt')) {
      trips.set(r.trip_id, { route: r.route_id, service: r.service_id, headsign: headsign(r.trip_headsign, routeNames[r.route_id] ?? ''), calls: [] });
    }
    for (const r of rows(dir, 'stop_times.txt')) {
      trips.get(r.trip_id)?.calls.push([Number(r.stop_sequence), r.stop_id, minutes(r.departure_time || r.arrival_time)]);
    }

    // Per route: unique stop sequences ("patterns"), and each trip as [id, pattern, service, headsign, start, ...deltas].
    const byRoute = new Map<string, { patterns: string[][]; patternIndex: Map<string, number>; headsigns: string[]; trips: (string | number)[][] }>();
    const stopRoutes = new Map<string, Set<string>>();
    for (const [tripId, t] of trips) {
      if (!t.calls.length || !services[t.service]) continue;
      t.calls.sort((a, b) => a[0] - b[0]);
      const route = byRoute.get(t.route) ?? { patterns: [], patternIndex: new Map(), headsigns: [], trips: [] };
      byRoute.set(t.route, route);
      const stopIds = t.calls.map((c) => c[1]);
      const key = stopIds.join(' ');
      let p = route.patternIndex.get(key);
      if (p === undefined) {
        p = route.patterns.push(stopIds) - 1;
        route.patternIndex.set(key, p);
      }
      let h = route.headsigns.indexOf(t.headsign);
      if (h < 0) h = route.headsigns.push(t.headsign) - 1;
      const times = t.calls.map((c) => c[2]);
      route.trips.push([tripId, p, t.service, h, times[0], ...times.slice(1).map((m, i) => m - times[i])]);
      for (const s of stopIds) (stopRoutes.get(s) ?? stopRoutes.set(s, new Set()).get(s)!).add(t.route);
    }

    // Stations: group served stops by name, then split each name's stops into clusters of nearby ones.
    const byName = new Map<string, string[]>();
    for (const id of stopRoutes.keys()) (byName.get(stops[id][0]) ?? byName.set(stops[id][0], []).get(stops[id][0])!).push(id);
    const stations: { id: string; name: string; lat: number; lon: number; stops: string[]; routes: string[] }[] = [];
    for (const [name, ids] of byName) {
      const clusters: string[][] = [];
      for (const id of ids) {
        const here: [number, number] = [stops[id][1], stops[id][2]];
        const near = clusters.find((c) => distanceMeters([stops[c[0]][1], stops[c[0]][2]], here) < STATION_RADIUS_M);
        if (near) near.push(id);
        else clusters.push([id]);
      }
      for (const members of clusters) {
        const lat = members.reduce((s, id) => s + stops[id][1], 0) / members.length;
        const lon = members.reduce((s, id) => s + stops[id][2], 0) / members.length;
        const routes = [...new Set(members.flatMap((id) => [...stopRoutes.get(id)!]))].sort();
        stations.push({ id: `s${members[0]}`, name, lat: Number(lat.toFixed(5)), lon: Number(lon.toFixed(5)), stops: members, routes });
      }
    }

    rmSync(OUT, { recursive: true, force: true });
    mkdirSync(join(OUT, 'routes'), { recursive: true });
    const feedDate = Object.values(services).flat().sort()[0];
    const stationRows = stations.map((s) => [s.id, s.name, s.lat, s.lon, s.stops.join(' '), s.routes.join(' ')]);
    writeFileSync(join(OUT, 'index.json'), JSON.stringify({ feedDate, services, routes: routeNames, stations: stationRows }));
    let biggest = 0;
    for (const [id, r] of byRoute) {
      const routeStops = Object.fromEntries([...new Set(r.patterns.flat())].map((s) => [s, stops[s]]));
      const json = JSON.stringify({ stops: routeStops, patterns: r.patterns, headsigns: r.headsigns, trips: r.trips });
      biggest = Math.max(biggest, json.length);
      writeFileSync(join(OUT, 'routes', `${encodeURIComponent(id)}.json`), json);
    }
    console.log(`NJ Transit: ${stations.length} stations, ${byRoute.size} routes, ${trips.size} trips; biggest route file ${(biggest / 1e6).toFixed(2)} MB`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
