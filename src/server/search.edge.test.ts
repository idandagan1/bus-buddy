// Stop search edge cases: odd queries, missing or malformed upstream data, retries, caching and the
// distance boundaries, with Coach USA's API and NJ Transit's index.json faked.
import { CORNER_M, groupCorners, townFinder } from './towns';
import type { Stop } from '@/types';

type RawStop = {
  id: string;
  stop: { name: string };
  place: { name: string | null; state: { code: string } };
  location: { latitude: string | number; longitude: string | number };
};

const coachStop = (id: string, name: string, town: string, state: string, latitude: number | string, longitude: number | string): RawStop => ({
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

type Station = (string | number)[];
const station = (code: string, name: string, lat: number, lon: number, routes: string, codes = code): Station => [`s${code}`, name, lat, lon, code, routes, codes];
const njtIndex = (stations: Station[], routes: Record<string, string> = { '166': '166', '126': '126' }) => ({ feedDate: '2026-11-09', services: {}, routes, stations });

const NJT_STATIONS = [
  station('13886', 'Hillside Ave at Highwood Ave', 40.92498, -73.96431, '166'),
  station('13893', 'Piermont Rd at Hillside Ave', 40.92534, -73.96437, '166'),
  station('13894', 'Piermont Rd at West Clinton Ave', 40.92411, -73.96473, '166'),
  station('20100', 'Dean St at Palisade Ave', 40.89275, -73.9726, '166'),
  station('31899', 'Port Authority Bus Terminal', 40.757, -73.9905, '166'),
  station('20496', 'Washington St at 1st St', 40.7378, -74.0302, '126'),
];

// Meters north of a latitude, by the same earth radius geo.ts uses.
const north = (lat: number, m: number) => lat + (m * 180) / (Math.PI * 6371000);

let calls: URL[];
// What Coach USA's /journey/location answers (throwing stands for a body that isn't JSON).
let coachBody: (url: URL) => unknown;
// Statuses (or dropped connections) Coach USA answers with before its usual answer.
let coachFails: (number | 'network')[];
let njt: unknown;
let transit: typeof import('./transit');
let coachusa: typeof import('./coachusa');
let njtransit: typeof import('./njtransit');

beforeEach(() => {
  jest.useFakeTimers({ advanceTimers: true });
  calls = [];
  coachBody = () => ({ results: COACH });
  coachFails = [];
  njt = njtIndex(NJT_STATIONS);
  jest.spyOn(console, 'error').mockImplementation(() => {});
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    calls.push(url);
    if (url.pathname === '/journey/location') {
      const next = coachFails.shift();
      if (next === 'network') throw new TypeError('fetch failed');
      if (next) return { ok: false, status: next, json: async () => null } as Response;
      return { ok: true, status: 200, json: async () => coachBody(url) } as Response;
    }
    if (url.pathname === '/njt/index.json') return { ok: !!njt, status: njt ? 200 : 404, json: async () => njt } as Response;
    return { ok: false, status: 404, json: async () => null } as Response;
  }) as typeof fetch;
  // Both carriers keep their stop lists in module state; start each test from nothing.
  jest.resetModules();
  /* eslint-disable @typescript-eslint/no-require-imports -- a fresh copy per test; jest can't import() here */
  transit = require('./transit');
  coachusa = require('./coachusa');
  njtransit = require('./njtransit');
  /* eslint-enable @typescript-eslint/no-require-imports */
});

afterEach(() => jest.useRealTimers());

const search = (query: string, origin?: string) => transit.searchStops('http://site', query, origin);
const names = (stops: Stop[]) => stops.map((s) => s.name);
const coachCalls = () => calls.filter((u) => u.pathname === '/journey/location');

describe('odd queries', () => {
  it('browses every Coach USA stop, nearest Midtown first, for an empty or blank query', async () => {
    for (const q of ['', ' ', '\t\n  ']) {
      const stops = await search(q);
      expect(names(stops)).toEqual(['Port Authority Bus Terminal', 'Dean St & Palisade Ave', 'Hillside Ave & Highwood Ave', 'Rte 9W & Clinton Ave']);
      expect(stops.every((s) => !s.carrier)).toBe(true);
    }
  });

  it('treats tabs, newlines and runs of spaces like one space', async () => {
    expect(names(await search('  tenafly \t  piermont\n'))).toEqual(names(await search('tenafly piermont')));
    expect(await search('tenafly piermont')).toHaveLength(2);
  });

  it('matches words in any order and part of a word', async () => {
    expect(names(await search('piermont tenafly'))).toEqual(names(await search('tenafly piermont')));
    expect(names(await search('hillsi'))).toContain('Hillside Ave & Highwood Ave');
  });

  it('needs every word to match', async () => {
    expect(await search('tenafly englewood')).toEqual([]);
  });

  it('finds stops by their state alone', async () => {
    const stops = await search('ny');
    expect(stops.map((s) => [s.name, !!s.carrier, !!s.sameCorner])).toEqual([
      ['Port Authority Bus Terminal', false, false],
      ['Port Authority Bus Terminal', true, true],
    ]);
    expect(stops[1]).toMatchObject({ town: 'New York', state: 'NY' });
  });

  it('takes punctuation literally', async () => {
    expect(names(await search('&')).filter((n) => !n.includes('&'))).toEqual([]);
    expect(await search('&')).toHaveLength(3);
    for (const q of ['(', '.*', '[a-z]', '\\', '?', '%', '"', "'"]) expect(await search(q)).toEqual([]);
  });

  it('returns nothing, without failing, for a very long query', async () => {
    expect(await search('tenafly '.repeat(2000) + 'x'.repeat(10000))).toEqual([]);
  });

  it('matches accented letters in any case', async () => {
    coachBody = () => ({ results: [coachStop('c-cafe', 'Café Angelique', 'Tenafly', 'NJ', 40.9255, -73.9636)] });
    expect(names(await search('CAFÉ'))).toEqual(['Café Angelique']);
  });

  it('finds nothing for emoji or other scripts', async () => {
    expect(await search('🚌')).toEqual([]);
    expect(await search('תנפליי')).toEqual([]);
  });
});

describe('stop numbers', () => {
  it('lists the exact number first, then shorter numbers starting with it', async () => {
    njt = njtIndex([
      station('5001', 'Long', 40.9, -74, '166'),
      station('500', 'Mid', 40.91, -74, '166'),
      station('50', 'Exact', 40.92, -74, '166'),
      station('5002', 'Long too', 40.93, -74, '166'),
      station('150', 'Ends in it', 40.94, -74, '166'),
    ]);
    expect((await search('50')).filter((s) => s.carrier).map((s) => s.code)).toEqual(['50', '500', '5001', '5002']);
  });

  it('matches only stop numbers, not digits in NJ Transit stop names', async () => {
    const stops = await search('1');
    expect(names(stops)).not.toContain('Washington St at 1st St');
    expect(stops.filter((s) => s.carrier).map((s) => s.code)).toEqual(['13886', '13893', '13894']);
  });

  it('still matches digits in Coach USA stop names', async () => {
    expect(names(await search('9'))).toContain('Rte 9W & Clinton Ave');
  });

  it('ignores spaces around a number', async () => {
    expect(await search(' 13893 ')).toEqual([expect.objectContaining({ code: '13893' })]);
  });

  it('shows the number searched for when a station has several', async () => {
    njt = njtIndex([station('13886', 'Two signs', 40.92498, -73.96431, '166', '13886 23886')]);
    expect((await search('23886'))[0]).toMatchObject({ name: 'Two signs', code: '23886' });
    expect((await search('Two signs'))[0]).toMatchObject({ code: '13886' });
  });

  it('skips stations without numbers but still finds them by name', async () => {
    njt = njtIndex([station('x', 'No sign', 40.92498, -73.96431, '166', ''), ['s-y', 'No codes at all', 40.92, -73.96, 'y', '166']]);
    expect((await search('1')).filter((s) => s.carrier)).toEqual([]);
    expect(names(await search('No'))).toEqual(['No sign', 'No codes at all']);
  });

  it('finds nothing for a number no stop has', async () => {
    expect(await search('99999999')).toEqual([]);
  });
});

describe('result limits', () => {
  it('keeps NJ Transit to 50 results', async () => {
    njt = njtIndex(Array.from({ length: 80 }, (_, i) => station(String(1000 + i), `Main St ${i}`, 40 + i * 0.1, -74, '166')));
    expect(await search('main')).toHaveLength(50);
    expect(await search('1')).toHaveLength(50);
  });
});

describe('malformed Coach USA data', () => {
  it('reads coordinates sent as numbers or as strings', async () => {
    const raw = coachStop('c-n', 'Numbers', 'Tenafly', 'NJ', 0, 0);
    raw.location = { latitude: 40.9, longitude: -73.9 };
    coachBody = () => ({ results: [raw, coachStop('c-s', 'Strings', 'Tenafly', 'NJ', ' 40.8 ', '-73.8')] });
    const stops = await coachusa.searchStops('');
    expect(stops.map((s) => [s.latitude, s.longitude])).toEqual([
      [40.9, -73.9],
      [40.8, -73.8],
    ]);
  });

  it('finds a stop with an empty town by its name, and doesn’t lend that empty town to NJ Transit', async () => {
    coachBody = () => ({ results: [coachStop('c-x', 'Hillside Ave & Highwood Ave', '', 'NJ', 40.92515, -73.96425), COACH[2]] });
    const stops = await search('hillside');
    expect(stops[0]).toMatchObject({ name: 'Hillside Ave & Highwood Ave', town: '' });
    // The empty-town stop is skipped; Englewood's stop is ~3.7 km away, too far to name it.
    expect(stops.find((s) => s.carrier)?.town).toBe('');
  });

  it('doesn’t match the word "null" for a stop without a town', async () => {
    const raw = coachStop('c-x', 'Nameless corner', 'x', 'NJ', 40.9, -73.9);
    raw.place.name = null;
    coachBody = () => ({ results: [raw] });
    expect(await coachusa.searchStops('null')).toEqual([]);
    expect((await coachusa.searchStops('nameless'))[0].town).toBe('');
  });

  it('returns nothing when Coach USA has no stops', async () => {
    coachBody = () => ({ results: [] });
    expect(await search('')).toEqual([]);
    // NJ Transit stops are still found, without towns to borrow.
    expect(await search('piermont')).toEqual([expect.objectContaining({ name: 'Piermont Rd at Hillside Ave', town: '' }), expect.objectContaining({ town: '' })]);
  });

  it('fails a search when Coach USA sends an empty body, no results list or broken JSON', async () => {
    for (const body of [() => null, () => ({}), () => ({ results: null })]) {
      jest.resetModules();
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- a fresh copy per case
      const fresh: typeof import('./transit') = require('./transit');
      coachBody = body;
      await expect(fresh.searchStops('http://site', 'tenafly')).rejects.toThrow();
    }
    coachBody = () => {
      throw new SyntaxError('Unexpected token < in JSON');
    };
    await expect(search('tenafly')).rejects.toThrow(/^coachusa .* not JSON$/);
  });

  it('still names NJ Transit destinations when Coach USA’s stop list is broken', async () => {
    coachBody = () => null;
    expect(await search('', 'njt:s13893')).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Dean St at Palisade Ave', town: '' })]));
  });
});

describe('Coach USA blips', () => {
  it('asks for every carrier’s pickup stops', async () => {
    await search('x');
    const params = coachCalls()[0].searchParams;
    expect(params.get('type')).toBe('pickup');
    expect(params.getAll('carrierCode')).toEqual(expect.arrayContaining(['RCK', 'COM', 'MBC']));
  });

  it.each([500, 502, 503, 429])('retries once after a %i', async (status) => {
    coachFails = [status];
    expect(await search('tenafly')).not.toEqual([]);
    expect(coachCalls()).toHaveLength(2);
  });

  it('retries once after a dropped connection', async () => {
    coachFails = ['network'];
    expect(await search('tenafly')).not.toEqual([]);
    expect(coachCalls()).toHaveLength(2);
  });

  it.each([400, 401, 403, 404])('doesn’t retry a %i', async (status) => {
    coachFails = [status];
    await expect(search('tenafly')).rejects.toThrow(`coachusa /journey/location → ${status}`);
    expect(coachCalls()).toHaveLength(1);
  });

  it('gives up after the second try', async () => {
    coachFails = [503, 503];
    await expect(search('tenafly')).rejects.toThrow(/^coachusa \/journey\/location → 503$/);
    coachFails = ['network', 'network'];
    await expect(search('tenafly')).rejects.toThrow('coachusa /journey/location → fetch failed');
    expect(coachCalls()).toHaveLength(4);
  });
});

describe('Coach USA’s stop list cache', () => {
  it('hands back the same list for an hour, then asks again', async () => {
    const first = await coachusa.allStops();
    jest.setSystemTime(Date.now() + 59 * 60 * 1000);
    expect(await coachusa.allStops()).toBe(first);
    expect(coachCalls()).toHaveLength(1);
    jest.setSystemTime(Date.now() + 2 * 60 * 1000);
    expect(await coachusa.allStops()).not.toBe(first);
    expect(coachCalls()).toHaveLength(2);
  });

  it('shares one request between searches made at the same time', async () => {
    await Promise.all([search('tenafly'), search('englewood'), coachusa.allStops()]);
    expect(coachCalls()).toHaveLength(1);
  });

  it('picks up new stops once the hour is up', async () => {
    expect(await search('Closter')).toEqual([]);
    coachBody = () => ({ results: [...COACH, coachStop('c-closter', 'Closter Plaza', 'Closter', 'NJ', 40.97, -73.96)] });
    expect(await search('Closter')).toEqual([]);
    jest.setSystemTime(Date.now() + 61 * 60 * 1000);
    expect(names(await search('Closter'))).toEqual(['Closter Plaza']);
  });

  it('asks Coach USA every time for an origin’s destinations', async () => {
    await search('', 'c-hillside');
    await search('', 'c-hillside');
    expect(coachCalls().map((u) => u.searchParams.get('origin'))).toEqual(['c-hillside', 'c-hillside']);
  });
});

describe('destinations', () => {
  it('offers Coach USA destinations for any id without NJ Transit’s prefix', async () => {
    coachBody = (url) => ({ results: url.searchParams.get('origin') === 'c-hillside' ? [COACH[3]] : [] });
    expect(await search('', 'c-hillside')).toEqual([expect.objectContaining({ id: 'c-pabt' })]);
    expect(await search('port', 'c-hillside')).toHaveLength(1);
    expect(await search('tenafly', 'c-hillside')).toEqual([]);
    expect(await search('', 'unknown')).toEqual([]);
    // The prefix is case-sensitive: this goes to Coach USA, not NJ Transit.
    await search('', 'NJT:s13893');
    expect(coachCalls().at(-1)?.searchParams.get('origin')).toBe('NJT:s13893');
  });

  it('offers nothing from an NJ Transit stop that doesn’t exist', async () => {
    expect(await search('', 'njt:nope')).toEqual([]);
    expect(await search('', 'njt:')).toEqual([]);
    expect(await search('13893', 'njt:nope')).toEqual([]);
  });

  it('offers nothing from a stop whose routes reach no other stop', async () => {
    njt = njtIndex([station('1', 'Alone', 40.9, -74, '999'), station('2', 'Elsewhere', 40.8, -74, '166')]);
    expect(await search('', 'njt:s1')).toEqual([]);
  });

  it('never offers the origin itself', async () => {
    expect((await search('', 'njt:s13893')).map((s) => s.id)).not.toContain('njt:s13893');
  });

  it('filters destinations by words and by stop number', async () => {
    expect(names(await search('port', 'njt:s13893'))).toEqual(['Port Authority Bus Terminal']);
    expect((await search('2010', 'njt:s13893')).map((s) => s.code)).toEqual(['20100']);
    expect(await search('20496', 'njt:s13893')).toEqual([]);
  });

  it('lists only the routes a destination shares with the origin, by name, in number order', async () => {
    njt = njtIndex([station('1', 'From', 40.9, -74, 'a b c d'), station('2', 'To', 40.8, -74, 'd c b a z')], { a: '166X', b: '20', c: '166', d: '126' });
    expect((await search('', 'njt:s1'))[0].routes).toEqual(['20', '126', '166', '166X']);
  });

  it('shows a route’s id when the index has no name for it', async () => {
    njt = njtIndex([station('1', 'From', 40.9, -74, '77'), station('2', 'To', 40.8, -74, '77')], {});
    expect((await search('', 'njt:s1'))[0].routes).toEqual(['77']);
  });

  it('offers nothing from a stop without routes', async () => {
    njt = njtIndex([station('1', 'No routes', 40.9, -74, ''), station('2', 'No routes either', 40.8, -74, '')]);
    expect(await search('', 'njt:s1')).toEqual([]);
  });

  it('lists no routes for a stop without any', async () => {
    njt = njtIndex([station('1', 'No routes', 40.9, -74, '')]);
    expect((await search('no routes'))[0].routes).toEqual([]);
  });

  it('fails with NJ Transit named when its files are down', async () => {
    njt = null;
    await expect(search('', 'njt:s13893')).rejects.toThrow('njtransit index.json → 404');
  });
});

describe('when sources are down or broken', () => {
  it('fails with Coach USA named when both are down', async () => {
    coachFails = [503, 503];
    njt = null;
    await expect(search('tenafly')).rejects.toThrow(/^coachusa/);
  });

  it('still returns Coach USA stops when NJ Transit’s index is malformed', async () => {
    njt = { feedDate: '2026-11-09' };
    expect(names(await search('tenafly'))).toEqual(['Hillside Ave & Highwood Ave', 'Rte 9W & Clinton Ave']);
  });

  it('reads NJ Transit’s files again once they’re back', async () => {
    njt = null;
    expect((await search('piermont')).some((s) => s.carrier)).toBe(false);
    njt = njtIndex(NJT_STATIONS);
    expect((await search('piermont')).some((s) => s.carrier)).toBe(true);
  });

  it('keeps NJ Transit’s files after they load once', async () => {
    await search('piermont');
    await search('dean');
    expect(calls.filter((u) => u.pathname === '/njt/index.json')).toHaveLength(1);
  });
});

describe('groupCorners', () => {
  const coach = (id: string, latitude: number, longitude = -74): Stop => ({ id, name: id, town: 'T', state: 'NJ', latitude, longitude });
  const njtStop = (id: string, latitude: number, longitude = -74): Stop => ({ id, name: id, town: '', state: '', latitude, longitude, carrier: 'NJT' });
  const view = (stops: Stop[]) => stops.map((s) => (s.sameCorner ? `  ${s.id}` : s.id));

  it('counts a stop just inside 100 m as the same corner, and just outside not', () => {
    expect(CORNER_M).toBe(100);
    const c = coach('c', 40.9);
    expect(view(groupCorners([c], [njtStop('in', north(40.9, 99.9)), njtStop('out', north(40.9, 100.1))]))).toEqual(['c', '  in', 'out']);
  });

  it('places an NJ Transit stop near two Coach USA stops once, under the first', () => {
    const a = coach('a', 40.9);
    const b = coach('b', north(40.9, 60));
    const n = njtStop('n', north(40.9, 30));
    expect(view(groupCorners([b, a], [n]))).toEqual(['b', '  n', 'a']);
  });

  it('keeps several NJ Transit stops on one corner in their order', () => {
    expect(view(groupCorners([coach('c', 40.9)], [njtStop('x', north(40.9, 50)), njtStop('y', north(40.9, -50))]))).toEqual(['c', '  x', '  y']);
  });

  it('marks a copy and leaves the input stops alone', () => {
    const n = njtStop('n', 40.9);
    const out = groupCorners([coach('c', 40.9)], [n]);
    expect(out[1]).not.toBe(n);
    expect(n.sameCorner).toBeUndefined();
  });

  it('handles either list being empty', () => {
    expect(groupCorners([], [])).toEqual([]);
    expect(view(groupCorners([coach('c', 40.9)], []))).toEqual(['c']);
    expect(view(groupCorners([], [njtStop('n', 40.9)]))).toEqual(['n']);
  });

  it('never puts a stop without coordinates on a corner', () => {
    expect(view(groupCorners([coach('c', 40.9)], [njtStop('n', NaN, NaN)]))).toEqual(['c', 'n']);
    expect(view(groupCorners([coach('c', NaN, NaN)], [njtStop('n', 40.9)]))).toEqual(['c', 'n']);
  });
});

describe('townFinder', () => {
  const place = (town: string, latitude: number, longitude = -74) => ({ town, state: 'NJ', latitude, longitude });

  it('names a stop up to 1500 m away, not further', () => {
    const townOf = townFinder([place('Tenafly', 40.9)]);
    expect(townOf(north(40.9, 1499), -74)).toEqual({ town: 'Tenafly', state: 'NJ' });
    expect(townOf(north(40.9, 1501), -74)).toBeNull();
    expect(townOf(north(40.9, -1499), -74)).toEqual({ town: 'Tenafly', state: 'NJ' });
  });

  it('picks the closest town when two are in range', () => {
    const townOf = townFinder([place('Far', north(40.9, 1200)), place('Near', north(40.9, -400))]);
    expect(townOf(40.9, -74)?.town).toBe('Near');
  });

  it('finds a town across a grid cell edge', () => {
    // 40.92 sits on a cell edge; the stop is just below it and the town 1400 m up.
    const townOf = townFinder([place('Up', north(40.9199, 1400))]);
    expect(townOf(40.9199, -74)?.town).toBe('Up');
  });

  it('skips places without a town for the next closest one', () => {
    const townOf = townFinder([place('', 40.9), place('Englewood', north(40.9, 800))]);
    expect(townOf(40.9, -74)?.town).toBe('Englewood');
  });

  it('names nothing with no places, or for a point without coordinates', () => {
    expect(townFinder([])(40.9, -74)).toBeNull();
    const townOf = townFinder([place('Tenafly', 40.9), place('Nowhere', NaN, NaN)]);
    expect(townOf(NaN, NaN)).toBeNull();
    expect(townOf(40.9, -74)?.town).toBe('Tenafly');
  });

  it('gives the same answer when asked again', () => {
    const townOf = townFinder([place('Tenafly', 40.9)]);
    expect(townOf(40.9, -74)).toBe(townOf(40.9, -74));
  });
});

describe('NJ Transit stations near a point', () => {
  it('lists stations within the distance, nearest first, with all their routes', async () => {
    njt = njtIndex([
      station('far', 'Far', north(40.9, 300), -74, '166'),
      station('mid', 'Mid', north(40.9, 200), -74, '166 126'),
      station('near', 'Near', north(40.9, 10), -74, '166'),
    ]);
    const stops = await njtransit.stationsNear('http://site', 40.9, -74, 250);
    expect(stops.map((s) => [s.name, s.town, s.routes])).toEqual([
      ['Near', '', ['166']],
      ['Mid', '', ['126', '166']],
    ]);
  });

  it('finds nothing for a point without coordinates', async () => {
    expect(await njtransit.stationsNear('http://site', NaN, NaN, 250)).toEqual([]);
  });

  it('reaches only stations sharing a route, and none from an unknown station', async () => {
    njt = njtIndex([
      station('a', 'From', 40.9, -74, '166'),
      station('b', 'Closer, other route', 40.8, -74, '126'),
      station('c', 'Shares a route', north(40.8, 50), -74, '166 126'),
    ]);
    expect(await njtransit.reachableNear('http://site', 'njt:sa', 40.8, -74, 600)).toMatchObject({ name: 'Shares a route', routes: ['166'] });
    expect(await njtransit.reachableNear('http://site', 'njt:sa', 40.8, -74, 40)).toBeNull();
    expect(await njtransit.reachableNear('http://site', 'njt:missing', 40.8, -74, 600)).toBeNull();
    // The origin itself never counts, however close.
    expect(await njtransit.reachableNear('http://site', 'njt:sa', 40.9, -74, 600)).toBeNull();
  });
});

describe('the other carrier at the same corner', () => {
  const place = (id: string, latitude: number, longitude: number) => ({ id, latitude, longitude });
  const partner = (from: ReturnType<typeof place>, to: ReturnType<typeof place>) => transit.findPartner('http://site', from, to);

  describe('from Coach USA to NJ Transit', () => {
    beforeEach(() => {
      njt = njtIndex([
        station('near', 'Near, dead end', north(40.9, 50), -74, '126'),
        station('in', 'Just inside', north(40.9, 240), -74, '166 126'),
        station('end', 'End', north(40.7, 550), -74, '166 20'),
        station('end2', 'End, farther', north(40.7, 590), -74, '166'),
        station('mid', 'Elsewhere on 126', 40.5, -74, '126'),
      ]);
    });

    it('skips a nearer stop that doesn’t reach the far end and uses one within 250 m that does', async () => {
      const leg = await partner(place('c-a', 40.9, -74), place('c-b', 40.7, -74));
      expect(leg?.from).toMatchObject({ name: 'Just inside', routes: ['166'] });
      expect(leg?.to).toMatchObject({ name: 'End', routes: ['166'] });
    });

    it('ignores stops just past 250 m at the start and 600 m at the end', async () => {
      // 'Just inside' is 260 m away here, and the nearer stop's route goes nowhere useful.
      expect(await partner(place('c-a', north(40.9, -20), -74), place('c-b', 40.7, -74))).toBeNull();
      // Both ends 610 m and more from here; moving 40 m the other way puts 'End' at 590 m.
      expect(await partner(place('c-a', 40.9, -74), place('c-b', north(40.7, 1200), -74))).toBeNull();
      expect((await partner(place('c-a', 40.9, -74), place('c-b', north(40.7, -40), -74)))?.to.name).toBe('End');
    });

    it('finds nothing when the start is far from NJ Transit, even if the end is close', async () => {
      expect(await partner(place('c-a', 41.5, -74), place('c-b', 40.7, -74))).toBeNull();
    });

    it('finds nothing for places without coordinates', async () => {
      expect(await partner(place('c-a', NaN, NaN), place('c-b', 40.7, -74))).toBeNull();
      expect(await partner(place('c-a', 40.9, -74), place('c-b', NaN, NaN))).toBeNull();
    });

    it('fails with NJ Transit named when its files are down', async () => {
      njt = null;
      await expect(partner(place('c-a', 40.9, -74), place('c-b', 40.7, -74))).rejects.toThrow(/^njtransit/);
    });
  });

  describe('from NJ Transit to Coach USA', () => {
    const hillside = COACH[0];
    const pabt = place('njt:s31899', 40.757, -73.9905);

    it('tries Coach USA stops on the corner nearest first, until one reaches the far end', async () => {
      const near = coachStop('c-near', 'Nearest, wrong way', 'Tenafly', 'NJ', 40.92534, -73.96437);
      coachBody = (url) => {
        const origin = url.searchParams.get('origin');
        if (!origin) return { results: [near, ...COACH] };
        return { results: origin === 'c-hillside' ? [COACH[3]] : [COACH[2]] };
      };
      const leg = await partner(place('njt:s13893', 40.92534, -73.96437), pabt);
      expect(leg).toEqual({ from: expect.objectContaining({ id: 'c-hillside' }), to: expect.objectContaining({ id: 'c-pabt' }) });
      expect(coachCalls().map((u) => u.searchParams.get('origin'))).toEqual([null, 'c-near', 'c-hillside']);
    });

    it('finds nothing when the corner’s Coach USA stop goes nowhere', async () => {
      coachBody = (url) => ({ results: url.searchParams.get('origin') ? [] : [hillside] });
      expect(await partner(place('njt:s13893', 40.92534, -73.96437), pabt)).toBeNull();
    });

    it('finds nothing when no Coach USA stop is within 250 m', async () => {
      expect(await partner(place('njt:s20496', 40.7378, -74.0302), pabt)).toBeNull();
      expect(coachCalls().filter((u) => u.searchParams.get('origin'))).toEqual([]);
    });

    it('fails with Coach USA named when it’s down', async () => {
      coachFails = [503, 503];
      await expect(partner(place('njt:s13893', 40.92534, -73.96437), pabt)).rejects.toThrow(/^coachusa/);
    });
  });
});
