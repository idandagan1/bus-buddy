import { distanceAlongPath, distanceMeters, distanceToStop, formatDistance, milesToMeters, pointBeforeEnd } from './geo';

// Meters to degrees around Tenafly, close enough for building test routes.
const M_PER_DEG_LAT = 111320;
const LAT = 40.9;
const M_PER_DEG_LON = M_PER_DEG_LAT * Math.cos((LAT * Math.PI) / 180);
const at = (eastM: number, northM: number) => ({ latitude: LAT + northM / M_PER_DEG_LAT, longitude: -74 + eastM / M_PER_DEG_LON });

// An L-shaped route: 2 km east, then 2 km north to the stop.
const path = [at(0, 0), at(2000, 0), at(2000, 2000)];
const stop = path[2];

describe('distanceAlongPath', () => {
  it('follows the stops instead of the straight line', () => {
    expect(distanceAlongPath(path[0], path)).toBeCloseTo(4000, -1);
    expect(distanceMeters(path[0], stop)).toBeCloseTo(2828, -1);
  });

  it('counts only what is left after the rider’s position on the route', () => {
    expect(distanceAlongPath(at(1000, 0), path)).toBeCloseTo(3000, -1);
    expect(distanceAlongPath(at(2000, 1500), path)).toBeCloseTo(500, -1);
  });

  it('treats a road that wanders off the line between stops as on the route', () => {
    // 1 km beside the first leg, as a highway might be.
    expect(distanceAlongPath(at(1000, -1000), path)).toBeCloseTo(3000, -1);
  });

  it('adds the excess when the rider is well off the route', () => {
    // 5 km south of the start: 1.5 km is tolerated, the other 3.5 km counts.
    // Within 50 m: at() is only approximately meters over this distance.
    expect(distanceAlongPath(at(0, -5000), path)).toBeCloseTo(4000 + 3500, -2);
  });

  it('never reports more than the whole route for a rider on it', () => {
    const total = distanceAlongPath(path[0], path);
    for (let east = 0; east <= 2000; east += 250) expect(distanceAlongPath(at(east, 300), path)).toBeLessThanOrEqual(total + 1);
  });
});

describe('pointBeforeEnd', () => {
  it('walks back along the route', () => {
    const p = pointBeforeEnd(path, 3000);
    expect(distanceMeters(p, at(1000, 0))).toBeLessThan(5);
    expect(distanceAlongPath(p, path)).toBeCloseTo(3000, -1);
  });

  it('stops at the start when the route is shorter', () => {
    expect(pointBeforeEnd(path, 10000)).toEqual(path[0]);
  });
});

describe('distanceToStop', () => {
  it('uses the route when the alarm has one', () => {
    expect(distanceToStop(path[0], { ...stop, path })).toBeCloseTo(4000, -1);
  });

  it('falls back to a straight line for alarms without a route', () => {
    expect(distanceToStop(path[0], stop)).toBeCloseTo(2828, -1);
  });
});

describe('formatDistance', () => {
  it.each([
    [50, '150 ft'],
    [400, '0.2 mi'],
    [milesToMeters(0.5), '0.5 mi'],
    [milesToMeters(1), '1 mi'],
    [milesToMeters(1.5), '1.5 mi'],
    [20000, '12 mi'],
  ])('%d m → %s', (m, label) => {
    expect(formatDistance(m)).toBe(label);
  });
});
