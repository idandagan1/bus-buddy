// The API routes end to end, each carrier's upstream faked. Kept out of src/app/: every file there is a route.
import type { Advisory, Trip, TripStatus } from '@/types';

type Reply = { status: number; body?: unknown; text?: string } | 'network';
let routes: [string, (url: string) => Reply][];
let calls: string[];
let inits: (RequestInit | undefined)[];

const coachTrip = {
  id: 'j1',
  carrier: { name: 'Rockland Coaches', code: 'RCK' },
  route: { longName: '20' },
  trip: { headsign: 'New York' },
  origin: { sequence: 1, farezone: 'TNFL', stop: { name: 'Hillside', platform: null, location: { latitude: 0, longitude: 0 } }, arrival: null, departure: { time: '2026-11-19T07:30:00-05:00', approximate: false } },
  destination: { sequence: 2, farezone: 'NYCP', stop: { name: 'PABT', platform: null, location: { latitude: 0, longitude: 0 } }, arrival: { time: '2026-11-19T08:10:00-05:00', approximate: false }, departure: null },
  stops: [],
};
const coachStatus = {
  status: 'SCHEDULED',
  origin: { departureTime: { scheduled: '2026-11-19T07:30:00-05:00' }, arrivalTime: { scheduled: '' } },
  destination: { departureTime: { scheduled: '' }, arrivalTime: { scheduled: '2026-11-19T08:10:00-05:00' } },
};
const njtIndex = {
  feedDate: '2026-11-09',
  services: { WK: ['2026-11-19'] },
  routes: { r166: '166' },
  stations: [
    ['A', 'Hillside Ave at Highwood Ave', 40.925, -73.964, 'sA', 'r166', '13886'],
    ['B', 'Port Authority Bus Terminal', 40.757, -73.99, '26229-321', 'r166', '31899'],
  ],
};
const njtRoute = {
  stops: { sA: ['Hillside', 40.925, -73.964], '26229-321': ['PABT', 40.757, -73.99] },
  patterns: [['sA', '26229-321']],
  headsigns: ['New York'],
  trips: [['t1', 0, 'WK', 0, 450, 40]],
};
const advisoryPage = (items: unknown[]) =>
  `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { serviceAdvisories: items } } })}</script>`;
const rule = (operator: string[], originZone: string[], destZone: string[]) => ({ operator, originZone, destZone });
const advisory = (slug: string, r: ReturnType<typeof rule>) => ({
  slug,
  heading: slug,
  severity: 'low',
  scheduleSummary: null,
  displayFromDate: null,
  displayUntilDate: null,
  displayRulesCollection: { items: [r] },
});

const reply = (...more: [string, (url: string) => Reply][]) => (routes = [...more, ...routes]);

beforeEach(() => {
  jest.useFakeTimers({ advanceTimers: true });
  jest.setSystemTime(new Date('2026-11-19T12:00:00Z'));
  jest.spyOn(console, 'error').mockImplementation(() => {});
  calls = [];
  inits = [];
  routes = [
    ['api.prod.coachusa.com/journey?', () => ({ status: 200, body: { results: [coachTrip] } })],
    ['/status?', () => ({ status: 200, body: coachStatus })],
    ['coachusa.com/travel-option', () => ({ status: 200, text: advisoryPage([]) })],
    ['/njt/index.json', () => ({ status: 200, body: njtIndex })],
    ['/njt/routes/r166.json', () => ({ status: 200, body: njtRoute })],
  ];
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    inits.push(init);
    const hit = routes.find(([k]) => url.includes(k));
    const r = hit ? hit[1](url) : { status: 404 };
    if (r === 'network') throw new TypeError('fetch failed');
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body, text: async () => r.text ?? '' } as Response;
  }) as typeof fetch;
  // Both carriers keep caches in module state; start each test from nothing.
  jest.resetModules();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

/* eslint-disable @typescript-eslint/no-require-imports -- a fresh copy per test; jest can't import() here */
const api = {
  trips: () => require('@/app/api/trips+api') as typeof import('@/app/api/trips+api'),
  status: () => require('@/app/api/status+api') as typeof import('@/app/api/status+api'),
  advisories: () => require('@/app/api/advisories+api') as typeof import('@/app/api/advisories+api'),
  geocode: () => require('@/app/api/geocode+api') as typeof import('@/app/api/geocode+api'),
};
/* eslint-enable @typescript-eslint/no-require-imports */

const get = (route: keyof typeof api, query: string) => api[route]().GET(new Request(`http://site/api/${route}?${query}`));

describe('GET /api/trips', () => {
  it.each(['', 'to=b&date=2026-11-19', 'from=a&date=2026-11-19', 'from=a&to=b', 'from=&to=b&date=2026-11-19'])('needs from, to and date (%s)', async (q) => {
    const res = await get('trips', q);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'from, to and date are required' });
    expect(calls).toEqual([]);
  });

  it('serves Coach USA trips for Coach USA stops, cached for five minutes', async () => {
    const res = await get('trips', 'from=c1&to=c2&date=2026-11-19');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=300');
    expect(((await res.json()) as Trip[]).map((t) => t.journeyId)).toEqual(['j1']);
    expect(calls.every((u) => u.startsWith('https://api.prod.coachusa.com/journey?'))).toBe(true);
  });

  it('serves NJ Transit trips from the site’s own files for NJ Transit stops', async () => {
    const res = await get('trips', 'from=njt:A&to=njt:B&date=2026-11-19');
    expect(((await res.json()) as Trip[]).map((t) => [t.journeyId, t.departure])).toEqual([['njt:r166:t1:0:1', '2026-11-19T07:30:00-05:00']]);
    expect(calls).toEqual(['http://site/njt/index.json', 'http://site/njt/routes/r166.json']);
  });

  it('serves an empty list as an empty list', async () => {
    reply(['api.prod.coachusa.com/journey?', () => ({ status: 200, body: { results: [] } })]);
    expect(await (await get('trips', 'from=c1&to=c2&date=2026-11-19')).json()).toEqual([]);
  });

  it('names the carrier that failed', async () => {
    reply(['api.prod.coachusa.com/journey?', () => ({ status: 404 })]);
    let res = await get('trips', 'from=c1&to=c2&date=2026-11-19');
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'coachusa /journey → 404', source: 'coachusa' });

    reply(['/njt/index.json', () => ({ status: 503 })]);
    res = await get('trips', 'from=njt:A&to=njt:B&date=2026-11-19');
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'njtransit index.json → 503', source: 'njtransit' });
  });

  it('blames the server for an answer it can’t read', async () => {
    reply(['api.prod.coachusa.com/journey?', () => ({ status: 200, body: { results: null } })]);
    const res = await get('trips', 'from=c1&to=c2&date=2026-11-19');
    expect(res.status).toBe(502);
    expect(((await res.json()) as { source: string }).source).toBe('server');
  });
});

describe('GET /api/status', () => {
  const statuses = async (q: string) => (await (await get('status', q)).json()) as Record<string, TripStatus | null>;

  it('answers an empty object when no trips are asked for', async () => {
    expect(await statuses('')).toEqual({});
    expect(await statuses('trips=,,')).toEqual({});
    expect(calls).toEqual([]);
  });

  it('keys each status by journey and date, briefly cached', async () => {
    const res = await get('status', 'trips=j1@2026-11-19,j2@2026-11-20');
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=10');
    const body = (await res.json()) as Record<string, TripStatus | null>;
    expect(Object.keys(body)).toEqual(['j1@2026-11-19', 'j2@2026-11-20']);
    expect(body['j1@2026-11-19']).toMatchObject({ state: 'SCHEDULED', vehicle: null, position: null });
    expect(calls).toContain('https://api.prod.coachusa.com/journey/j2/status?date=2026-11-20');
  });

  it('answers null for a trip whose status fails, without failing the rest', async () => {
    reply(['/journey/bad/status', () => ({ status: 404 })]);
    expect(await statuses('trips=bad@2026-11-19,j1@2026-11-19')).toEqual({ 'bad@2026-11-19': null, 'j1@2026-11-19': expect.objectContaining({ state: 'SCHEDULED' }) });
  });

  it('asks NJ Transit about its own trips, and answers null when its feed is unavailable', async () => {
    expect(await statuses('trips=njt:r166:t1:0:1@2026-11-19')).toEqual({ 'njt:r166:t1:0:1@2026-11-19': null });
    expect(calls.some((u) => u.includes('coachusa'))).toBe(false);
  });

  it('looks up at most 12 trips', async () => {
    const keys = Array.from({ length: 15 }, (_, i) => `j${i}@2026-11-19`).join(',');
    expect(Object.keys(await statuses(`trips=${keys}`))).toHaveLength(12);
    expect(calls).toHaveLength(12);
  });
});

describe('GET /api/advisories', () => {
  const ids = async (q: string) => ((await (await get('advisories', q)).json()) as Advisory[]).map((a) => a.id);

  it('needs a carrier', async () => {
    const res = await get('advisories', 'fromZone=TNFL');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'carrier is required' });
  });

  it('passes the zones on, and missing zones as none', async () => {
    reply(['coachusa.com/travel-option', () => ({ status: 200, text: advisoryPage([advisory('any', rule(['RCK'], ['*'], ['*'])), advisory('tenafly', rule(['RCK'], ['TNFL'], ['*']))]) })]);
    const res = await get('advisories', 'carrier=RCK&fromZone=TNFL&toZone=NYCP');
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=600');
    expect(((await res.json()) as Advisory[]).map((a) => a.id)).toEqual(['any', 'tenafly']);
    expect(await ids('carrier=RCK')).toEqual(['any']);
  });

  it('names Coach USA when its advisories can’t be read', async () => {
    reply(['coachusa.com/travel-option', () => ({ status: 200, text: '<html></html>' })]);
    const res = await get('advisories', 'carrier=RCK');
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'coachusa advisories: page format changed', source: 'coachusa' });
  });

  it('answers no NJ Transit alerts rather than failing when its feed is unavailable', async () => {
    const res = await get('advisories', 'carrier=NJT&fromZone=r166');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
    expect(calls.some((u) => u.includes('coachusa'))).toBe(false);
  });

  it('answers no NJ Transit alerts for a trip without a route, without asking', async () => {
    expect(await ids('carrier=NJT')).toEqual([]);
    expect(calls).toEqual([]);
  });
});

describe('GET /api/geocode', () => {
  const NOMINATIM = 'nominatim.openstreetmap.org';

  it.each(['', 'q=', 'q=%20%20'])('answers null for an empty query without asking (%s)', async (q) => {
    const res = await get('geocode', q);
    expect(res.status).toBe(200);
    expect(await res.json()).toBeNull();
    expect(calls).toEqual([]);
  });

  it('answers the first match as numbers, identifying itself to Nominatim', async () => {
    reply([NOMINATIM, () => ({ status: 200, body: [{ lat: '40.9251', lon: '-73.9642' }, { lat: '1', lon: '2' }] })]);
    const res = await get('geocode', 'q=%20Main%20St,%20Tenafly%20NJ%20');
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=86400');
    expect(await res.json()).toEqual({ latitude: 40.9251, longitude: -73.9642 });
    const url = new URL(calls[0]);
    expect(Object.fromEntries(url.searchParams)).toEqual({ q: 'Main St, Tenafly NJ', format: 'jsonv2', limit: '1', countrycodes: 'us' });
    expect((inits[0]?.headers as Record<string, string>)['User-Agent']).toMatch(/^BusBuddy\//);
  });

  it('answers null when nothing matches', async () => {
    reply([NOMINATIM, () => ({ status: 200, body: [] })]);
    expect(await (await get('geocode', 'q=nowhere')).json()).toBeNull();
  });

  it('answers 502 when Nominatim fails', async () => {
    reply([NOMINATIM, () => ({ status: 429 })]);
    const res = await get('geocode', 'q=Tenafly');
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'Geocoding failed' });
  });

  it('answers 502 when Nominatim can’t be reached', async () => {
    reply([NOMINATIM, () => 'network']);
    const res = await get('geocode', 'q=Tenafly');
    expect(res.status).toBe(502);
  });
});
