type LatLng = { latitude: number; longitude: number };

const METERS_PER_MILE = 1609.344;

export function distanceMeters(a: LatLng, b: LatLng) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const milesToMeters = (mi: number) => Math.round(mi * METERS_PER_MILE);

// "0.5 mi", "12 mi", or feet when it's very close.
export function formatDistance(m: number) {
  const mi = m / METERS_PER_MILE;
  if (mi < 0.1) return `${Math.max(50, Math.round((m * 3.28084) / 50) * 50)} ft`;
  return `${mi < 10 ? Number(mi.toFixed(1)) : Math.round(mi)} mi`;
}

// Closest point to `p` on the segment a→b. Fine to treat lat/lon as flat over a few miles.
function nearestOnSegment(p: LatLng, a: LatLng, b: LatLng): LatLng {
  const k = Math.cos((p.latitude * Math.PI) / 180);
  const [ax, ay, bx, by, px, py] = [a.longitude * k, a.latitude, b.longitude * k, b.latitude, p.longitude * k, p.latitude];
  const len2 = (bx - ax) ** 2 + (by - ay) ** 2;
  const t = len2 ? Math.min(1, Math.max(0, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / len2)) : 0;
  return { latitude: a.latitude + t * (b.latitude - a.latitude), longitude: a.longitude + t * (b.longitude - a.longitude) };
}

// Roads wander away from the straight line between two stops (a highway, a tunnel approach), so being this
// far off it still counts as on the route.
const ON_ROUTE_M = 1500;

// How far is left to the end of `path` (the trip's stops in order), following the stops instead of a straight
// line, so a winding route doesn't ring early. Being well off the route (e.g. still at home) adds the excess.
export function distanceAlongPath(here: LatLng, path: LatLng[]) {
  if (path.length < 2) return distanceMeters(here, path[path.length - 1]);
  const rest = path.map(() => 0);
  for (let i = path.length - 2; i >= 0; i--) rest[i] = rest[i + 1] + distanceMeters(path[i], path[i + 1]);
  let best = { off: Infinity, left: 0 };
  for (let i = 0; i < path.length - 1; i++) {
    const snap = nearestOnSegment(here, path[i], path[i + 1]);
    const off = distanceMeters(here, snap);
    if (off < best.off) best = { off, left: distanceMeters(snap, path[i + 1]) + rest[i + 1] };
  }
  return best.left + Math.max(0, best.off - ON_ROUTE_M);
}

// The point `meters` before the end of `path`, measured along it (or the start, if the path is shorter).
export function pointBeforeEnd(path: LatLng[], meters: number): LatLng {
  let left = meters;
  for (let i = path.length - 1; i > 0; i--) {
    const seg = distanceMeters(path[i - 1], path[i]);
    if (seg >= left) {
      const t = left / seg;
      return { latitude: path[i].latitude + t * (path[i - 1].latitude - path[i].latitude), longitude: path[i].longitude + t * (path[i - 1].longitude - path[i].longitude) };
    }
    left -= seg;
  }
  return path[0];
}

// Distance to the alarm's stop: along the route when we know it, straight line otherwise.
export const distanceToStop = (here: LatLng, stop: LatLng & { path?: LatLng[] }) =>
  stop.path && stop.path.length > 1 ? distanceAlongPath(here, stop.path) : distanceMeters(here, stop);
