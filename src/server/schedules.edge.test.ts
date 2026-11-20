// Coach USA schedules, statuses and advisories at their edges: odd payloads, missing fields, day boundaries.
let coach: typeof import('./coachusa');
let routes: Record<string, () => { status: number; body?: unknown; text?: string } | 'network'>;
let calls: string[];

type Time = { time: string; approximate: boolean } | null;
const at = (time: string, approximate = false): Time => ({ time, approximate });
const call = (sequence: number, name: string, arrival: Time, departure: Time, platform: string | null = null, farezone: string | null = null) => ({
  sequence,
  farezone,
  stop: { name, platform, location: { latitude: '40.9', longitude: '-73.9' } },
  arrival,
  departure,
});
const trip = (id: string, origin: ReturnType<typeof call>, destination: ReturnType<typeof call>, stops: ReturnType<typeof call>[] = []) => ({
  id,
  carrier: { name: 'Rockland Coaches', code: 'RCK' },
  route: { longName: '20' },
  trip: { headsign: 'New York' },
  origin,
  destination,
  stops,
});

beforeEach(() => {
  jest.useFakeTimers({ advanceTimers: true });
  jest.setSystemTime(new Date('2026-11-19T12:00:00Z'));
  calls = [];
  routes = {};
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const key = Object.keys(routes).find((k) => url.includes(k));
    const r = key ? routes[key]() : { status: 404 };
    if (r === 'network') throw new TypeError('fetch failed');
    return { ok: r.status === 200, status: r.status, json: async () => r.body, text: async () => r.text ?? '' } as Response;
  }) as typeof fetch;
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- a fresh cache per test; jest can't import() here
  coach = require('./coachusa');
});

afterEach(() => jest.useRealTimers());

const journeys = (results: unknown) => (routes['/journey?'] = () => ({ status: 200, body: { results } }));

describe('Coach USA trips', () => {
  it('maps a trip, keeping only the stops between the rider’s two', async () => {
    journeys([
      trip(
        'j1',
        call(2, 'Hillside', null, at('2026-11-19T07:30:00-05:00', true), 'G12', 'TNFL'),
        call(4, 'PABT', at('2026-11-19T08:10:00-05:00'), null, null, 'NYCP'),
        [
          call(1, 'Start', null, at('2026-11-19T07:20:00-05:00')),
          call(2, 'Hillside', null, at('2026-11-19T07:30:00-05:00')),
          call(3, 'Englewood', at('2026-11-19T07:45:00-05:00'), null),
          call(4, 'PABT', at('2026-11-19T08:10:00-05:00'), null),
          call(5, 'Garage', at('2026-11-19T08:30:00-05:00'), null),
        ],
      ),
    ]);
    const [t] = await coach.getTrips('a', 'b', '2026-11-19');
    expect(t).toMatchObject({
      id: 'j1:2026-11-19T07:30:00-05:00',
      journeyId: 'j1',
      serviceDate: '2026-11-19',
      carrierCode: 'RCK',
      fromZone: 'TNFL',
      toZone: 'NYCP',
      gate: 'G12',
      departure: '2026-11-19T07:30:00-05:00',
      arrival: '2026-11-19T08:10:00-05:00',
      approximate: true,
    });
    // A stop with only an arrival time shows that time; coordinates come as strings upstream.
    expect(t.stops.map((s) => [s.name, s.time])).toEqual([
      ['Hillside', '2026-11-19T07:30:00-05:00'],
      ['Englewood', '2026-11-19T07:45:00-05:00'],
      ['PABT', '2026-11-19T08:10:00-05:00'],
    ]);
    expect(t.stops[0].latitude).toBe(40.9);
  });

  it('falls back to the other time when a call has only one', async () => {
    // Origin with only an arrival, destination with only a departure.
    journeys([trip('j1', call(1, 'A', at('2026-11-19T07:30:00-05:00'), null, ''), call(2, 'B', null, at('2026-11-19T08:00:00-05:00')))]);
    const [t] = await coach.getTrips('a', 'b', '2026-11-19');
    expect(t.departure).toBe('2026-11-19T07:30:00-05:00');
    expect(t.arrival).toBe('2026-11-19T08:00:00-05:00');
    // No departure → not approximate; an empty platform is no gate.
    expect(t.approximate).toBe(false);
    expect(t.gate).toBeNull();
    expect(t.fromZone).toBeNull();
    expect(t.stops).toEqual([]);
  });

  it('dates a trip by when it starts in New York, not in UTC', async () => {
    journeys([
      // 03:00Z is still the evening before in New York.
      trip('late', call(1, 'A', null, at('2026-11-20T03:00:00Z')), call(2, 'B', at('2026-11-20T04:00:00Z'), null)),
      // Boards after midnight, but the bus left its first stop the day before.
      trip(
        'owl',
        call(2, 'A', null, at('2026-11-20T00:10:00-05:00')),
        call(3, 'B', at('2026-11-20T00:40:00-05:00'), null),
        [call(1, 'Start', null, at('2026-11-19T23:50:00-05:00')), call(2, 'A', null, at('2026-11-20T00:10:00-05:00'))],
      ),
    ]);
    const trips = await coach.getTrips('a', 'b', '2026-11-19');
    expect(Object.fromEntries(trips.map((t) => [t.journeyId, t.serviceDate]))).toEqual({ late: '2026-11-19', owl: '2026-11-19' });
  });

  it('sorts by the actual instant, then the earlier arrival', async () => {
    journeys([
      trip('local', call(1, 'A', null, at('2026-11-19T19:30:00-05:00')), call(2, 'B', at('2026-11-19T20:30:00-05:00'), null)),
      trip('express', call(1, 'A', null, at('2026-11-19T19:30:00-05:00')), call(2, 'B', at('2026-11-19T20:00:00-05:00'), null)),
      // 00:20Z is 19:20 in New York: first, though its string sorts last.
      trip('utc', call(1, 'A', null, at('2026-11-20T00:20:00Z')), call(2, 'B', at('2026-11-20T01:20:00Z'), null)),
    ]);
    expect((await coach.getTrips('a', 'b', '2026-11-19')).map((t) => t.journeyId)).toEqual(['utc', 'express', 'local']);
  });

  it('returns no trips when Coach USA has none', async () => {
    journeys([]);
    expect(await coach.getTrips('a', 'b', '2026-11-19')).toEqual([]);
  });

  it('asks Coach USA for the route and date', async () => {
    journeys([]);
    await coach.getTrips('o 1', 'd&2', '2026-11-19');
    const url = new URL(calls[0]);
    expect(url.pathname).toBe('/journey');
    expect(Object.fromEntries(url.searchParams)).toEqual({ origin: 'o 1', destination: 'd&2', dateFrom: '2026-11-19' });
  });

  it('rejects a malformed answer rather than returning a half-built schedule', async () => {
    routes['/journey?'] = () => ({ status: 200, body: {} });
    await expect(coach.getTrips('a', 'b', '2026-11-19')).rejects.toThrow();
    journeys([trip('j1', call(1, 'A', null, null), call(2, 'B', null, null))]);
    await expect(coach.getTrips('a', 'b', '2026-11-20')).rejects.toThrow();
  });
});

describe('Coach USA trip cache', () => {
  beforeEach(() => journeys([trip('j1', call(1, 'A', null, at('2026-11-19T07:30:00-05:00')), call(2, 'B', at('2026-11-19T08:00:00-05:00'), null))]));

  it('keeps each route and date apart', async () => {
    await coach.getTrips('a', 'b', '2026-11-19');
    await coach.getTrips('a', 'b', '2026-11-20');
    await coach.getTrips('b', 'a', '2026-11-19');
    await coach.getTrips('a', 'b', '2026-11-19');
    expect(calls).toHaveLength(3);
  });

  it('asks again once five minutes have passed', async () => {
    await coach.getTrips('a', 'b', '2026-11-19');
    jest.setSystemTime(Date.now() + 5 * 60 * 1000 - 1000);
    await coach.getTrips('a', 'b', '2026-11-19');
    expect(calls).toHaveLength(1);
    jest.setSystemTime(Date.now() + 2000);
    await coach.getTrips('a', 'b', '2026-11-19');
    expect(calls).toHaveLength(2);
  });

  it('doesn’t remember a failure', async () => {
    const ok = routes['/journey?'];
    routes['/journey?'] = () => ({ status: 404 });
    await expect(coach.getTrips('a', 'b', '2026-11-19')).rejects.toThrow('coachusa /journey → 404');
    routes['/journey?'] = ok;
    expect(await coach.getTrips('a', 'b', '2026-11-19')).toHaveLength(1);
  });

  it('serves the saved schedule when a later answer is malformed or rejected', async () => {
    await coach.getTrips('a', 'b', '2026-11-19');
    jest.setSystemTime(Date.now() + 10 * 60 * 1000);
    routes['/journey?'] = () => ({ status: 200, body: { results: null } });
    expect(await coach.getTrips('a', 'b', '2026-11-19')).toHaveLength(1);
    routes['/journey?'] = () => ({ status: 400 });
    expect(await coach.getTrips('a', 'b', '2026-11-19')).toHaveLength(1);
  });

  it('forgets the oldest route once 500 are saved', async () => {
    for (let i = 0; i <= 500; i++) await coach.getTrips(`o${i}`, 'b', '2026-11-19');
    expect(calls).toHaveLength(501);
    await coach.getTrips('o500', 'b', '2026-11-19');
    await coach.getTrips('o1', 'b', '2026-11-19');
    expect(calls).toHaveLength(501);
    await coach.getTrips('o0', 'b', '2026-11-19');
    expect(calls).toHaveLength(502);
  });

  it('counts a refreshed route as the newest', async () => {
    await coach.getTrips('o0', 'b', '2026-11-19');
    jest.setSystemTime(Date.now() + 10 * 60 * 1000);
    for (let i = 1; i < 500; i++) await coach.getTrips(`o${i}`, 'b', '2026-11-19');
    // o0 is stale: asking again refetches it and moves it to the back, so o1 goes when the cache overflows.
    await coach.getTrips('o0', 'b', '2026-11-19');
    await coach.getTrips('o500', 'b', '2026-11-19');
    const before = calls.length;
    await coach.getTrips('o0', 'b', '2026-11-19');
    expect(calls).toHaveLength(before);
    await coach.getTrips('o1', 'b', '2026-11-19');
    expect(calls).toHaveLength(before + 1);
  });
});

describe('Coach USA status', () => {
  const live = (extra: object) =>
    (routes['/status'] = () => ({
      status: 200,
      body: {
        status: 'IN_PROGRESS',
        origin: { departureTime: { scheduled: '2026-11-19T07:30:00-05:00', actual: '2026-11-19T07:33:00-05:00' }, arrivalTime: { scheduled: 'x' } },
        destination: { departureTime: { scheduled: 'x' }, arrivalTime: { scheduled: '2026-11-19T08:10:00-05:00', estimated: '2026-11-19T08:15:00-05:00' } },
        ...extra,
      },
    }));

  it('maps a full status', async () => {
    live({ vehicleName: '5012', vehiclePosition: { latitude: 40.9, longitude: -73.96, speedMph: 31, lastUpdated: '2026-11-19T12:40:00Z' }, timeRetrieved: '2026-11-19T12:40:05Z' });
    expect(await coach.getStatus('j1', '2026-11-19')).toEqual({
      state: 'IN_PROGRESS',
      vehicle: '5012',
      departure: { scheduled: '2026-11-19T07:30:00-05:00', actual: '2026-11-19T07:33:00-05:00' },
      arrival: { scheduled: '2026-11-19T08:10:00-05:00', estimated: '2026-11-19T08:15:00-05:00' },
      position: { latitude: 40.9, longitude: -73.96, speedMph: 31, updated: '2026-11-19T12:40:00Z' },
      retrieved: '2026-11-19T12:40:05Z',
    });
  });

  it('has nulls for what Coach USA leaves out', async () => {
    live({});
    expect(await coach.getStatus('j1', '2026-11-19')).toMatchObject({ vehicle: null, position: null, retrieved: null });
    live({ vehiclePosition: null });
    jest.setSystemTime(Date.now() + 1);
    expect((await coach.getStatus('j1', '2026-11-19')).position).toBeNull();
  });

  it('keeps a stopped bus’s speed of 0 and leaves an unknown one null', async () => {
    live({ vehiclePosition: { latitude: 1, longitude: 2, speedMph: 0 } });
    expect((await coach.getStatus('j1', '2026-11-19')).position).toEqual({ latitude: 1, longitude: 2, speedMph: 0, updated: null });
    live({ vehiclePosition: { latitude: 1, longitude: 2 } });
    expect((await coach.getStatus('j1', '2026-11-19')).position?.speedMph).toBeNull();
  });

  it('escapes the journey id in the path', async () => {
    live({});
    await coach.getStatus('a/b c', '2026-11-19');
    expect(calls[0]).toBe('https://api.prod.coachusa.com/journey/a%2Fb%20c/status?date=2026-11-19');
  });

  it('fails with Coach USA named', async () => {
    await expect(coach.getStatus('j1', '2026-11-19')).rejects.toThrow('coachusa /journey/j1/status → 404');
  });
});

describe('Coach USA advisories', () => {
  const rule = (operator: string[], originZone: string[], destZone: string[]) => ({ operator, originZone, destZone });
  const advisory = (slug: string, extra: object = {}) => ({
    slug,
    heading: ` ${slug} heading `,
    severity: 'high',
    scheduleSummary: null,
    displayFromDate: null,
    displayUntilDate: null,
    displayRulesCollection: { items: [rule(['*'], ['*'], ['*'])] },
    ...extra,
  });
  const page = (serviceAdvisories: unknown) =>
    (routes['coachusa.com/travel-option'] = () => ({
      status: 200,
      text: `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { serviceAdvisories } } })}</script></html>`,
    }));
  const slugs = async (carrier = 'RCK', from: string | null = 'TNFL', to: string | null = 'NYCP') => (await coach.getAdvisories(carrier, from, to)).map((a) => a.id);

  it('shows only advisories inside their display window', async () => {
    page([
      advisory('open'),
      advisory('started', { displayFromDate: '2026-11-19T11:00:00Z' }),
      advisory('starts-now', { displayFromDate: '2026-11-19T12:00:00Z' }),
      advisory('future', { displayFromDate: '2026-11-19T13:00:00Z' }),
      advisory('ended', { displayUntilDate: '2026-11-19T11:59:59Z' }),
      advisory('ends-later', { displayUntilDate: '2026-11-20T00:00:00Z' }),
    ]);
    expect(await slugs()).toEqual(['open', 'started', 'starts-now', 'ends-later']);
  });

  it('matches a rule by carrier and zones, with * for any', async () => {
    page([
      advisory('rck', { displayRulesCollection: { items: [rule(['RCK'], ['*'], ['*'])] } }),
      advisory('other-carrier', { displayRulesCollection: { items: [rule(['SUB'], ['*'], ['*'])] } }),
      advisory('zones', { displayRulesCollection: { items: [rule(['*'], ['TNFL'], ['NYCP'])] } }),
      advisory('wrong-zone', { displayRulesCollection: { items: [rule(['*'], ['TNFL'], ['HOBK'])] } }),
      // One matching rule is enough.
      advisory('any-rule', { displayRulesCollection: { items: [rule(['SUB'], ['*'], ['*']), rule(['RCK'], ['TNFL'], ['*'])] } }),
      advisory('no-rules', { displayRulesCollection: { items: [] } }),
    ]);
    expect(await slugs()).toEqual(['rck', 'zones', 'any-rule']);
  });

  it('matches a trip without zones only by rules for any zone', async () => {
    page([
      advisory('any'),
      advisory('zoned', { displayRulesCollection: { items: [rule(['*'], ['TNFL'], ['*'])] } }),
      // A literal "null" zone isn't a missing one.
      advisory('null-string', { displayRulesCollection: { items: [rule(['*'], ['null'], ['*'])] } }),
    ]);
    expect(await slugs('RCK', null, null)).toEqual(['any']);
  });

  it('turns the rich text into trimmed paragraphs', async () => {
    const text = (value: string) => ({ nodeType: 'text', value });
    page([
      advisory('a', {
        displayFromDate: '2026-11-18T00:00:00Z',
        scheduleSummary: {
          json: {
            nodeType: 'document',
            content: [
              { nodeType: 'paragraph', content: [text(' Buses detour '), { nodeType: 'hyperlink', content: [text('via Route 4') ] }, text('. ')] },
              { nodeType: 'paragraph', content: [text('   ')] },
              { nodeType: 'paragraph' },
              { nodeType: 'paragraph', content: [text('Expect delays.')] },
            ],
          },
        },
      }),
      advisory('b', { scheduleSummary: { json: { nodeType: 'document' } } }),
    ]);
    expect(await coach.getAdvisories('RCK', null, null)).toEqual([
      { id: 'a', heading: 'a heading', severity: 'high', paragraphs: ['Buses detour via Route 4.', 'Expect delays.'], updated: '2026-11-18T00:00:00Z' },
      { id: 'b', heading: 'b heading', severity: 'high', paragraphs: [], updated: null },
    ]);
  });

  it('has none when the page lists none', async () => {
    page(undefined);
    expect(await slugs()).toEqual([]);
  });

  it('reads the page once every ten minutes', async () => {
    page([advisory('a')]);
    await slugs();
    await slugs('SUB');
    expect(calls).toHaveLength(1);
    jest.setSystemTime(Date.now() + 10 * 60 * 1000 + 1);
    await slugs();
    expect(calls).toHaveLength(2);
  });

  it('fails with Coach USA named when the page changes shape, and tries again next time', async () => {
    routes['coachusa.com/travel-option'] = () => ({ status: 200, text: '<html>maintenance</html>' });
    await expect(slugs()).rejects.toThrow('coachusa advisories: page format changed');
    page([advisory('a')]);
    expect(await slugs()).toEqual(['a']);
  });

  it('treats an error page as a changed page', async () => {
    routes['coachusa.com/travel-option'] = () => ({ status: 503, text: 'Service Unavailable' });
    await expect(slugs()).rejects.toThrow(/^coachusa advisories/);
  });

  it('names Coach USA when its page can’t be reached', async () => {
    routes['coachusa.com/travel-option'] = () => 'network';
    await expect(slugs()).rejects.toThrow(/^coachusa/);
  });
});
