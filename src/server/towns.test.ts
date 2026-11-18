import { groupCorners, townFinder } from './towns';
import type { Stop } from '@/types';

const coach = (name: string, town: string, latitude: number, longitude: number): Stop => ({ id: name, name, town, state: 'NJ', latitude, longitude });
const njt = (name: string, latitude: number, longitude: number): Stop => ({ id: `njt:${name}`, name, town: '', state: '', latitude, longitude, carrier: 'NJT' });

const hillside = coach('Hillside Ave & Highwood Ave', 'Tenafly', 40.92515, -73.96425);
const englewood = coach('Palisade Ave & Dean St', 'Englewood', 40.89262, -73.97268);

test('an NJ Transit stop takes the town of the closest Coach USA stop', () => {
  const townOf = townFinder([hillside, englewood]);
  expect(townOf(40.92534, -73.96437)).toEqual({ town: 'Tenafly', state: 'NJ' });
  expect(townOf(40.8935, -73.973)).toEqual({ town: 'Englewood', state: 'NJ' });
});

test('a stop far from every Coach USA stop gets no town', () => {
  expect(townFinder([hillside])(40.7357, -74.1724)).toBeNull();
});

test('NJ Transit stops on a Coach USA stop’s corner are listed right under it', () => {
  const piermont = njt('Piermont Rd at Hillside Ave', 40.92534, -73.96437);
  const palisade = njt('Palisade Ave at Tenafly Rd', 40.9176, -73.9616);
  const grouped = groupCorners([englewood, hillside], [palisade, piermont]);
  expect(grouped.map((s) => [s.name, !!s.sameCorner])).toEqual([
    ['Palisade Ave & Dean St', false],
    ['Hillside Ave & Highwood Ave', false],
    ['Piermont Rd at Hillside Ave', true],
    ['Palisade Ave at Tenafly Rd', false],
  ]);
});
