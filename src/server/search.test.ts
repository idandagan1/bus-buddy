// Stop search across both carriers, end to end, with Coach USA's API and NJ Transit's index.json faked.
import type { Stop } from '@/types';

const coachStop = (id: string, name: string, town: string, state: string, latitude: number, longitude: number) => ({
  id,
  stop: { name },
  place: { name: town, state: { code: state } },
  location: { latitude: String(latitude), longitude: String(longitude) },
});

const COACH = [
  coachStop('c-hillside', 'Hillside Ave & Highwood Ave', 'Tenafly', 'NJ', 40.92515, -73.96425),
  coachStop('c-9w', 'Rte 9W & Clinton Ave', 'Tenafly', 'NJ', 40.9257, -73.9472),
  coachStop('c-dean', 'Dean St & Palisade Ave', 'Englewood', 'NJ', 40.89262, -73.97268),
  coachStop('c-pabt', 'Port Authority Bus Terminal', 'New York', 'NY', 40.7569, -73.9903),
];

const station = (code: string, name: string, lat: number, lon: number, routes: string) => [`s${code}`, name, lat, lon, code, routes, code];

const NJT = {
  feedDate: '2026-11-09',
  services: {},
  routes: { '166': '166', '126': '126' },
  stations: [
    station('13886', 'Hillside Ave at Highwood Ave', 40.92498, -73.96431, '166'),
    station('13893', 'Piermont Rd at Hillside Ave', 40.92534, -73.96437, '166'),
    // A block (~120 m) from the Coach USA stop: same town, not the same corner.
    station('13894', 'Piermont Rd at West Clinton Ave', 40.92411, -73.96473, '166'),
    station('13873', 'Riveredge Rd at Tenafly Rd', 40.9152, -73.9531, '166'),
    station('20100', 'Dean St at Palisade Ave', 40.89275, -73.9726, '166'),
    station('31899', 'Port Authority Bus Terminal', 40.757, -73.9905, '166'),
    // Hoboken has no Coach USA stop nearby, so it gets no town.
    station('20496', 'Washington St at 1st St', 40.7378, -74.0302, '126'),
  ],
};

let calls: string[];
let coachUp: boolean;
let njtUp: boolean;
let transit: typeof import('./transit');

beforeEach(() => {
  calls = [];
  coachUp = njtUp = true;
  jest.spyOn(console, 'error').mockImplementation(() => {});
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const body = url.includes('/journey/location') ? (coachUp ? { results: COACH } : null) : url.endsWith('/njt/index.json') ? (njtUp ? NJT : null) : null;
    return { ok: !!body, status: body ? 200 : 503, json: async () => body } as Response;
  }) as typeof fetch;
  // Both carriers keep their stop lists in module state; start each test from nothing.
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- a fresh copy per test; jest can't import() here
  transit = require('./transit');
});

const search = (query: string, origin?: string) => transit.searchStops('http://site', query, origin);
const names = (stops: Stop[]) => stops.map((s) => s.name);
const byName = (stops: Stop[], name: string) => stops.find((s) => s.name === name);

describe('searching a town', () => {
  it('finds the NJ Transit stops in it, not only those named after it', async () => {
    const stops = await search('Tenafly');
    expect(names(stops)).toEqual(
      expect.arrayContaining(['Hillside Ave at Highwood Ave', 'Piermont Rd at Hillside Ave', 'Piermont Rd at West Clinton Ave', 'Riveredge Rd at Tenafly Rd']),
    );
    expect(names(stops)).not.toContain('Dean St at Palisade Ave');
    expect(byName(stops, 'Piermont Rd at Hillside Ave')).toMatchObject({ town: 'Tenafly', state: 'NJ', carrier: 'NJT', code: '13893' });
  });

  it('ignores case and matches words across the stop name and town', async () => {
    expect(names(await search('tenafly PIERMONT'))).toEqual(['Piermont Rd at Hillside Ave', 'Piermont Rd at West Clinton Ave']);
    expect(names(await search('hillside tenafly'))).toEqual(['Hillside Ave & Highwood Ave', 'Hillside Ave at Highwood Ave', 'Piermont Rd at Hillside Ave']);
  });

  it('gives the town of the closest Coach USA stop', async () => {
    expect(byName(await search('Dean'), 'Dean St at Palisade Ave')?.town).toBe('Englewood');
  });

  it('leaves NJ Transit stops far from any Coach USA stop without a town', async () => {
    expect(await search('Hoboken')).toEqual([]);
    expect(await search('Washington')).toEqual([expect.objectContaining({ name: 'Washington St at 1st St', town: '' })]);
  });

  it('browses Coach USA’s stops before anything is typed, without NJ Transit’s thousands', async () => {
    const stops = await search('   ');
    expect(stops).toHaveLength(COACH.length);
    expect(stops.some((s) => s.carrier === 'NJT')).toBe(false);
  });

  it('returns nothing for a query that matches nothing', async () => {
    expect(await search('Atlantis')).toEqual([]);
  });
});

describe('stops on the same corner', () => {
  it('lists NJ Transit stops right under the Coach USA stop they share a corner with', async () => {
    const stops = await search('Tenafly');
    const at = names(stops).indexOf('Hillside Ave & Highwood Ave');
    expect(stops.slice(at, at + 3).map((s) => [s.name, !!s.sameCorner])).toEqual([
      ['Hillside Ave & Highwood Ave', false],
      ['Hillside Ave at Highwood Ave', true],
      ['Piermont Rd at Hillside Ave', true],
    ]);
  });

  it('doesn’t call a stop a block away the same corner', async () => {
    expect(byName(await search('Tenafly'), 'Piermont Rd at West Clinton Ave')?.sameCorner).toBeUndefined();
  });

  it('lists each NJ Transit stop once', async () => {
    const all = names(await search('Tenafly'));
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('stop numbers', () => {
  it('still finds an NJ Transit stop by the number on its sign, with its town', async () => {
    expect(await search('13893')).toEqual([expect.objectContaining({ name: 'Piermont Rd at Hillside Ave', code: '13893', town: 'Tenafly' })]);
  });
});

describe('destinations', () => {
  it('only offers NJ Transit stops a route from the origin reaches, with their towns', async () => {
    const stops = await search('', 'njt:s13893');
    expect(names(stops)).not.toContain('Piermont Rd at Hillside Ave');
    expect(names(stops)).not.toContain('Washington St at 1st St');
    expect(byName(stops, 'Dean St at Palisade Ave')).toMatchObject({ town: 'Englewood', routes: ['166'] });
  });
});

describe('when a source is down', () => {
  it('still finds NJ Transit stops by name if Coach USA is down', async () => {
    coachUp = false;
    await expect(search('Tenafly')).rejects.toThrow(/^coachusa/);
    const stops = await search('', 'njt:s13893');
    expect(byName(stops, 'Dean St at Palisade Ave')).toMatchObject({ town: '' });
  });

  it('still returns Coach USA stops if NJ Transit’s files are down', async () => {
    njtUp = false;
    expect(names(await search('Tenafly'))).toEqual(['Hillside Ave & Highwood Ave', 'Rte 9W & Clinton Ave']);
  });
});

describe('caching', () => {
  it('fetches Coach USA’s stop list once for many searches', async () => {
    await search('Tenafly');
    await search('Englewood');
    await search('', 'njt:s13893');
    expect(calls.filter((u) => u.includes('/journey/location'))).toHaveLength(1);
  });

  it('tries Coach USA again after a failed fetch', async () => {
    coachUp = false;
    await expect(search('Tenafly')).rejects.toThrow();
    coachUp = true;
    expect(names(await search('Tenafly'))).toContain('Piermont Rd at Hillside Ave');
  });
});

describe('the other carrier at the same corner', () => {
  const place = (id: string, latitude: number, longitude: number) => ({ id, latitude, longitude });
  const hillside = place('c-hillside', 40.92515, -73.96425);
  const pabt = place('c-pabt', 40.7569, -73.9903);

  it('pairs a Coach USA route with NJ Transit buses from the same corner to the same terminal', async () => {
    const leg = await transit.findPartner('http://site', hillside, pabt);
    expect(leg?.from).toMatchObject({ carrier: 'NJT', routes: ['166'] });
    expect(['Hillside Ave at Highwood Ave', 'Piermont Rd at Hillside Ave']).toContain(leg?.from.name);
    expect(leg?.to).toMatchObject({ name: 'Port Authority Bus Terminal', carrier: 'NJT' });
  });

  it('pairs an NJ Transit route with Coach USA the other way', async () => {
    const leg = await transit.findPartner('http://site', place('njt:s13893', 40.92534, -73.96437), place('njt:s31899', 40.757, -73.9905));
    expect(leg?.from.name).toBe('Hillside Ave & Highwood Ave');
    expect(leg?.to.name).toBe('Port Authority Bus Terminal');
    expect(leg?.from.carrier).toBeUndefined();
  });

  it('finds nothing where the other carrier doesn’t stop', async () => {
    expect(await transit.findPartner('http://site', place('c-9w', 40.9257, -73.9472), pabt)).toBeNull();
  });
});
