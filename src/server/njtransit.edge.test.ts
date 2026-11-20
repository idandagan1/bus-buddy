// NJ Transit schedules, live status and alerts, with the static files and GTFS-realtime feeds faked.
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';

const { FeedMessage } = GtfsRealtimeBindings.transit_realtime;

let njt: typeof import('./njtransit');
let files: Record<string, unknown>;
let feeds: Record<string, unknown[] | number | undefined>;
let calls: string[];

// [id, name, lat, lon, stops, routes, codes]
const INDEX = {
  feedDate: '2026-11-09',
  services: { WK: ['2026-11-19', '2026-11-20'], SAT: ['2026-11-21'], OLD: ['2026-11-01'] },
  routes: { r166: '166', r126: '126' },
  stations: [
    ['A', 'Hillside Ave at Highwood Ave', 40.925, -73.964, 'sA', 'r166', '13886'],
    // Across the street from A: its stop counts as A's too.
    ['A2', 'Highwood Ave opposite Hillside', 40.9251, -73.9641, 'sA2', 'r166', '13887'],
    ['B', 'Port Authority Bus Terminal', 40.757, -73.99, '26229-321 26229-200_1', 'r166 r126', '31899'],
    ['H', 'Washington St at 1st St', 40.7378, -74.0302, 'sH', 'r126', '20496'],
  ],
};

const R166 = {
  stops: {
    sA: ['Hillside', 40.925, -73.964],
    sA2: ['Highwood opp', 40.9251, -73.9641],
    sM: ['Englewood', 40.89, -73.97],
    '26229-321': ['PABT 321', 40.757, -73.99],
  },
  patterns: [
    ['sA', 'sM', '26229-321'],
    ['26229-321', 'sM', 'sA'],
    // Serves both corners: the rider's own stop (sA) should be the one boarded.
    ['sA2', 'sA', 'sM', '26229-321'],
  ],
  headsigns: ['New York', 'New York Express', 'New York Turnpike', 'Tenafly'],
  variants: ['', 'X', 'T', ''],
  trips: [
    ['local', 0, 'WK', 0, 450, 10, 30],
    ['express', 0, 'WK', 1, 450, 5, 20],
    ['turnpike', 0, 'SAT', 2, 600, 10, 25],
    ['outbound', 1, 'WK', 3, 1020, 30, 10],
    ['old', 0, 'OLD', 0, 450, 10, 30],
    ['unknown-service', 0, 'NOPE', 0, 450, 10, 30],
    // 24:30 — after midnight, on the service day before.
    ['owl', 0, 'WK', 0, 1470, 10, 30],
    ['sat-owl', 0, 'SAT', 0, 1470, 10, 30],
    ['corners', 2, 'SAT', 0, 480, 1, 10, 30],
  ],
};

beforeEach(() => {
  jest.useFakeTimers({ advanceTimers: true });
  jest.setSystemTime(new Date('2026-11-19T12:00:00Z'));
  process.env.NJT_USERNAME = 'user';
  process.env.NJT_PASSWORD = 'pass';
  calls = [];
  files = { 'index.json': INDEX, 'routes/r166.json': R166 };
  feeds = { authenticateUser: [{ UserToken: 'tok' }] };
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const file = url.split('/njt/')[1];
    if (file !== undefined) {
      const body = files[decodeURIComponent(file)];
      return { ok: !!body, status: body ? 200 : 404, json: async () => body } as Response;
    }
    const name = url.split('/').at(-1)!;
    const next = feeds[name];
    const r = Array.isArray(next) ? (next.length > 1 ? next.shift() : next[0]) : next;
    if (typeof r === 'number' || r === undefined) return { ok: false, status: r ?? 500, json: async () => ({}) } as Response;
    if (r instanceof Uint8Array) {
      const buf = r.buffer.slice(r.byteOffset, r.byteOffset + r.byteLength);
      return { ok: true, status: 200, arrayBuffer: async () => buf } as Response;
    }
    return { ok: true, status: 200, json: async () => r } as Response;
  }) as typeof fetch;
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- a fresh copy per test; jest can't import() here
  njt = require('./njtransit');
});

afterEach(() => {
  jest.useRealTimers();
  delete process.env.NJT_USERNAME;
  delete process.env.NJT_PASSWORD;
});

const trips = (from = 'njt:A', to = 'njt:B', date = '2026-11-19') => njt.getTrips('http://site', from, to, date);

describe('NJ Transit trips', () => {
  it('lists three days of trips, express first when two leave together', async () => {
    const list = await trips();
    expect(list.map((t) => `${t.serviceDate} ${t.route} ${t.departure}`)).toEqual([
      '2026-11-19 166X 2026-11-19T07:30:00-05:00',
      '2026-11-19 166 2026-11-19T07:30:00-05:00',
      '2026-11-19 166 2026-11-20T00:30:00-05:00',
      '2026-11-20 166X 2026-11-20T07:30:00-05:00',
      '2026-11-20 166 2026-11-20T07:30:00-05:00',
      '2026-11-20 166 2026-11-21T00:30:00-05:00',
      '2026-11-21 166 2026-11-21T08:01:00-05:00',
      '2026-11-21 166T 2026-11-21T10:00:00-05:00',
    ]);
  });

  it('builds ids, stops and times from the trip’s pattern', async () => {
    const t = (await trips()).find((x) => x.id === 'njt:express:2026-11-19')!;
    expect(t).toEqual({
      id: 'njt:express:2026-11-19',
      journeyId: 'njt:r166:express:0:2',
      serviceDate: '2026-11-19',
      route: '166X',
      carrier: 'NJ Transit',
      carrierCode: 'NJT',
      fromZone: 'r166',
      toZone: null,
      headsign: 'New York Express',
      gate: null,
      departure: '2026-11-19T07:30:00-05:00',
      arrival: '2026-11-19T07:55:00-05:00',
      approximate: false,
      stops: [
        { name: 'Hillside', time: '2026-11-19T07:30:00-05:00', latitude: 40.925, longitude: -73.964 },
        { name: 'Englewood', time: '2026-11-19T07:35:00-05:00', latitude: 40.89, longitude: -73.97 },
        { name: 'PABT 321', time: '2026-11-19T07:55:00-05:00', latitude: 40.757, longitude: -73.99 },
      ],
    });
  });

  it('boards at the rider’s own stop when the bus serves the corner twice', async () => {
    const t = (await trips()).find((x) => x.id === 'njt:corners:2026-11-21')!;
    expect(t.journeyId).toBe('njt:r166:corners:1:3');
    expect(t.departure).toBe('2026-11-21T08:01:00-05:00');
  });

  it('leaves out the last day’s after-midnight buses, which belong with the next day', async () => {
    const ids = (await trips()).map((t) => t.id);
    expect(ids).toContain('njt:owl:2026-11-20');
    expect(ids).not.toContain('njt:sat-owl:2026-11-21');
  });

  it('only lists trips that run on the asked days and go the asked way', async () => {
    const ids = (await trips()).map((t) => t.id.split(':')[1]);
    expect(ids).not.toContain('old');
    expect(ids).not.toContain('unknown-service');
    expect(ids).not.toContain('outbound');
  });

  it('shows the gate when the trip starts at a terminal', async () => {
    const back = await trips('njt:B', 'njt:A');
    expect(back.map((t) => [t.id, t.gate, t.headsign, t.departure])).toEqual([
      ['njt:outbound:2026-11-19', '321', 'Tenafly', '2026-11-19T17:00:00-05:00'],
      ['njt:outbound:2026-11-20', '321', 'Tenafly', '2026-11-20T17:00:00-05:00'],
    ]);
  });

  it('has nothing for unknown stations or stations no route joins', async () => {
    expect(await trips('njt:nope', 'njt:B')).toEqual([]);
    expect(await trips('njt:A', 'njt:H')).toEqual([]);
    // Neither asks for a route file.
    expect(calls.filter((u) => u.includes('/routes/'))).toEqual([]);
  });

  it('has nothing on days without service', async () => {
    expect(await trips('njt:A', 'njt:B', '2026-12-25')).toEqual([]);
  });

  it('crosses the fall-back night with the right offsets', async () => {
    files['index.json'] = { ...INDEX, services: { WK: ['2026-10-31'] } };
    const list = await trips('njt:A', 'njt:B', '2026-10-31');
    // 24:30 on Oct 31 is 00:30 EDT on Nov 1, before the clocks go back.
    expect(list.find((t) => t.id === 'njt:owl:2026-10-31')?.departure).toBe('2026-11-01T00:30:00-04:00');
    expect(list.find((t) => t.id === 'njt:local:2026-10-31')?.arrival).toBe('2026-10-31T08:10:00-04:00');
  });

  it('thins long trips but keeps both ends', async () => {
    const pattern = Array.from({ length: 40 }, (_, i) => `s${i}`);
    pattern[0] = 'sA';
    pattern[39] = '26229-321';
    const stops = Object.fromEntries(pattern.map((s, i) => [s, [`Stop ${i}`, 40.9 - i * 0.004, -73.97]]));
    files['routes/r166.json'] = { ...R166, stops, patterns: [pattern], trips: [['long', 0, 'WK', 0, 400, ...Array(39).fill(1)]] };
    const [t] = await trips();
    expect(t.stops).toHaveLength(30);
    expect(t.stops[0].name).toBe('Stop 0');
    expect(t.stops.at(-1)?.name).toBe('Stop 39');
    expect(t.arrival).toBe('2026-11-19T07:19:00-05:00');
  });

  it('fails with NJ Transit named when its files are missing, and tries again next time', async () => {
    delete files['index.json'];
    await expect(trips()).rejects.toThrow('njtransit index.json → 404');
    files['index.json'] = INDEX;
    delete files['routes/r166.json'];
    await expect(trips()).rejects.toThrow('njtransit routes/r166.json → 404');
    files['routes/r166.json'] = R166;
    expect((await trips()).length).toBeGreaterThan(0);
  });
});

const feed = (entity: unknown[], timestamp = 1795000000) => FeedMessage.encode(FeedMessage.fromObject({ header: { gtfsRealtimeVersion: '2.0', timestamp }, entity })).finish();
const secs = (iso: string) => Date.parse(iso) / 1000;

describe('NJ Transit status', () => {
  const status = (journeyId = 'njt:r166:local:0:2') => njt.getStatus('http://site', journeyId, '2026-11-19');
  const update = (tripUpdate: object) => (feeds.getTripUpdates = [feed([{ id: '1', tripUpdate: { trip: { tripId: 'local' }, ...tripUpdate } }])]);

  it('shows predicted times, the bus and where it is', async () => {
    update({
      stopTimeUpdate: [
        { stopSequence: 1, stopId: 'sA', departure: { time: secs('2026-11-19T12:32:00Z') } },
        { stopSequence: 3, stopId: '26229-321', arrival: { time: secs('2026-11-19T13:14:00Z') } },
      ],
    });
    feeds.getVehiclePositions = [feed([{ id: 'v', vehicle: { trip: { tripId: 'local' }, vehicle: { label: '5012' }, position: { latitude: 40.9, longitude: -73.96, speed: 10 }, timestamp: secs('2026-11-19T12:30:00Z') } }])];
    const s = await status();
    expect(s).toMatchObject({
      state: 'SCHEDULED',
      vehicle: '5012',
      departure: { scheduled: '2026-11-19T07:30:00-05:00', estimated: '2026-11-19T12:32:00.000Z' },
      arrival: { scheduled: '2026-11-19T08:10:00-05:00', estimated: '2026-11-19T13:14:00.000Z' },
      position: { latitude: expect.closeTo(40.9), longitude: expect.closeTo(-73.96), updated: '2026-11-19T12:30:00.000Z' },
      retrieved: new Date(1795000000 * 1000).toISOString(),
    });
    expect(s?.position?.speedMph).toBeCloseTo(22.37, 1);
  });

  it('marks the bus on its way once the boarding stop is passed, at the schedule plus the trip’s delay', async () => {
    update({ delay: 180, stopTimeUpdate: [{ stopSequence: 3, arrival: { time: secs('2026-11-19T13:13:00Z') } }] });
    const s = await status();
    expect(s?.state).toBe('IN_PROGRESS');
    expect(s?.departure).toEqual({ scheduled: '2026-11-19T07:30:00-05:00', actual: '2026-11-19T12:33:00.000Z' });
  });

  it('falls back to the first predicted stop’s delay when the trip has none', async () => {
    update({ stopTimeUpdate: [{ stopSequence: 3, arrival: { delay: 120, time: secs('2026-11-19T13:12:00Z') } }] });
    const s = await status();
    expect(s?.state).toBe('IN_PROGRESS');
    expect(s?.departure).toEqual({ scheduled: '2026-11-19T07:30:00-05:00', actual: '2026-11-19T12:32:00.000Z' });
  });

  it('carries the last known delay to a stop the feed doesn’t predict', async () => {
    update({ stopTimeUpdate: [{ stopSequence: 1, departure: { delay: 300, time: secs('2026-11-19T12:35:00Z') } }] });
    expect((await status())?.arrival).toEqual({ scheduled: '2026-11-19T08:10:00-05:00', estimated: '2026-11-19T13:15:00.000Z' });
  });

  it('calls a canceled trip or a skipped stop canceled', async () => {
    update({ trip: { tripId: 'local', scheduleRelationship: 3 }, stopTimeUpdate: [{ stopSequence: 1, departure: { time: 1 } }] });
    expect((await status())?.state).toBe('CANCELED');
    jest.setSystemTime(Date.now() + 60 * 1000);
    update({ stopTimeUpdate: [{ stopSequence: 1, scheduleRelationship: 1 }, { stopSequence: 3, arrival: { time: 1 } }] });
    const s = await status();
    expect(s?.state).toBe('CANCELED');
    expect(s?.departure).toEqual({ scheduled: '2026-11-19T07:30:00-05:00' });
  });

  it('calls a trip with nothing left to predict completed', async () => {
    update({ stopTimeUpdate: [] });
    expect(await status()).toMatchObject({ state: 'COMPLETED', departure: { scheduled: '2026-11-19T07:30:00-05:00' } });
  });

  const bare = () => {
    feeds.getTripUpdates = [FeedMessage.encode(FeedMessage.fromObject({ header: { gtfsRealtimeVersion: '2.0' }, entity: [{ id: '1', tripUpdate: { trip: { tripId: 'local' }, stopTimeUpdate: [{ stopSequence: 1, departure: { delay: 60 } }] } }] })).finish()];
    feeds.getVehiclePositions = [feed([{ id: 'v', vehicle: { trip: { tripId: 'local' }, position: { latitude: 40.9, longitude: -73.96 } } }])];
  };

  it('has no speed for a bus that doesn’t report one', async () => {
    bare();
    expect((await status())?.position?.speedMph).toBeNull();
  });

  it('leaves times unknown when the feed doesn’t give them', async () => {
    bare();
    const s = await status();
    expect(s?.retrieved).toBeNull();
    expect(s?.position?.updated).toBeNull();
    expect(s?.departure).toEqual({ scheduled: '2026-11-19T07:30:00-05:00' });
  });

  it('still answers without bus positions', async () => {
    update({ vehicle: { label: '7001' }, stopTimeUpdate: [{ stopSequence: 1, departure: { time: 1 } }] });
    feeds.getVehiclePositions = 503;
    expect(await status()).toMatchObject({ vehicle: '7001', position: null });
  });

  it('has no status for a trip the feed doesn’t list, or one the schedule doesn’t know', async () => {
    feeds.getTripUpdates = [feed([])];
    expect(await status()).toBeNull();
    expect(await status('njt:r166:ghost:0:2')).toBeNull();
  });

  it('logs in again once when the token is turned away', async () => {
    feeds.authenticateUser = [{ UserToken: 'old' }, { UserToken: 'new' }];
    feeds.getTripUpdates = [401, feed([])];
    expect(await status()).toBeNull();
    expect(calls.filter((u) => u.endsWith('/authenticateUser'))).toHaveLength(2);
  });

  it('fails clearly without credentials or a login', async () => {
    delete process.env.NJT_PASSWORD;
    await expect(status()).rejects.toThrow('NJ Transit credentials are not set');
    process.env.NJT_PASSWORD = 'pass';
    feeds.authenticateUser = [{}];
    await expect(status()).rejects.toThrow('NJ Transit login failed');
  });

  it('fails with NJ Transit named when the feed is down', async () => {
    feeds.getTripUpdates = 500;
    await expect(status()).rejects.toThrow('njtransit getTripUpdates → 500');
  });
});

describe('NJ Transit alerts', () => {
  const now = secs('2026-11-19T12:00:00Z');
  const alert = (id: string, a: object) => ({ id, alert: { informedEntity: [{ routeId: 'r166' }], ...a } });
  const text = (t: string) => ({ translation: [{ text: t }] });

  it('lists active alerts for the route, split into a heading and the rest', async () => {
    feeds.getAlerts = [
      feed([
        alert('detour', { descriptionText: text(' Detour on Main St. Use stops on Oak Ave. Expect delays. '), severityLevel: 4, activePeriod: [{ start: now - 60, end: now + 3600 }] }),
        alert('detour', { descriptionText: text('Duplicate.') }),
        alert('header-only', { headerText: text('Snow schedule today'), descriptionText: text('  ') }),
        alert('empty', { headerText: text('') }),
        alert('other-route', { informedEntity: [{ routeId: 'r126' }], headerText: text('Not ours.') }),
        alert('stop-only', { informedEntity: [{ stopId: '26229-321' }], headerText: text('Welcome to PABT.') }),
        alert('over', { headerText: text('Over.'), activePeriod: [{ start: now - 7200, end: now - 60 }] }),
        alert('later', { headerText: text('Later.'), activePeriod: [{ start: now + 60, end: now + 7200 }] }),
        alert('second-period', { headerText: text('Again.'), activePeriod: [{ start: now - 7200, end: now - 3600 }, { start: now - 60, end: now + 60 }] }),
      ]),
    ];
    expect(await njt.getAdvisories('r166')).toEqual([
      { id: 'detour', heading: 'Detour on Main St.', severity: 'high', paragraphs: ['Use stops on Oak Ave. Expect delays.'], updated: '2026-11-19T11:59:00.000Z' },
      { id: 'header-only', heading: 'Snow schedule today', severity: 'low', paragraphs: [], updated: null },
      { id: 'second-period', heading: 'Again.', severity: 'low', paragraphs: [], updated: '2026-11-19T10:00:00.000Z' },
    ]);
  });

  it('shows an alert whose active period has no end', async () => {
    feeds.getAlerts = [feed([alert('open', { headerText: text('Until further notice.'), activePeriod: [{ start: now - 60 }] })])];
    expect((await njt.getAdvisories('r166')).map((a) => a.id)).toEqual(['open']);
  });

  it('has none for a trip without a route, without asking the feed', async () => {
    expect(await njt.getAdvisories(null)).toEqual([]);
    expect(calls).toEqual([]);
  });
});
