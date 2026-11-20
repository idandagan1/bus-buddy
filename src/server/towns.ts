// NJ Transit's feed has no towns, so its stops borrow them from Coach USA's, which do. A stop takes the town
// of the closest Coach USA stop within TOWN_M; one in a town Coach USA doesn't serve stays without one.
// Stops are bucketed into a grid so naming every NJ Transit station costs a few cell lookups each.
import { distanceMeters } from '@/geo';
import type { Stop } from '@/types';

const TOWN_M = 1500;
// Stops this close are the same corner (Coach USA's "Hillside Ave & Highwood Ave" and NJ Transit's "Piermont
// Rd at Hillside Ave" in Tenafly are 40 m apart).
export const CORNER_M = 100;
// About 1.5 km each way at New Jersey's latitude (a degree of longitude is ~0.75 of one of latitude), so the
// 3×3 cells around a point cover TOWN_M in every direction.
const CELL_LAT = 0.015;
const CELL_LON = 0.02;

type Place = Pick<Stop, 'town' | 'state' | 'latitude' | 'longitude'>;
export type Town = { town: string; state: string };

const cellOf = (lat: number, lon: number) => [Math.floor(lat / CELL_LAT), Math.floor(lon / CELL_LON)];

export function townFinder(places: Place[]) {
  const grid = new Map<string, Place[]>();
  for (const p of places) {
    if (!p.town) continue;
    const key = cellOf(p.latitude, p.longitude).join();
    grid.get(key)?.push(p) ?? grid.set(key, [p]);
  }
  // Stations are looked up again on every search; remember each answer.
  const known = new Map<string, Town | null>();
  return (latitude: number, longitude: number): Town | null => {
    const id = `${latitude},${longitude}`;
    if (known.has(id)) return known.get(id)!;
    const [y, x] = cellOf(latitude, longitude);
    let best: Place | null = null;
    let bestM = TOWN_M;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const p of grid.get(`${y + dy},${x + dx}`) ?? []) {
          const m = distanceMeters({ latitude, longitude }, p);
          if (m <= bestM) [best, bestM] = [p, m];
        }
      }
    }
    const town = best && { town: best.town, state: best.state };
    known.set(id, town);
    return town;
  };
}

// Search results with each NJ Transit stop on the same corner as a Coach USA stop moved right under it, so
// two names for one physical stop read as one place.
export function groupCorners(coach: Stop[], njt: Stop[]): Stop[] {
  const placed = new Set<Stop>();
  const out: Stop[] = [];
  for (const c of coach) {
    out.push(c);
    for (const n of njt) {
      // Written so a stop with bad coordinates (NaN distance) is never on the corner.
      if (placed.has(n) || !(distanceMeters(c, n) <= CORNER_M)) continue;
      placed.add(n);
      out.push({ ...n, sameCorner: true });
    }
  }
  return [...out, ...njt.filter((n) => !placed.has(n))];
}
