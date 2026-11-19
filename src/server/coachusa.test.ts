// Coach USA's API faked: its blips should reach riders as little as possible.
let coach: typeof import('./coachusa');
let responses: (number | 'network')[];
let calls: number;

const journey = {
  results: [
    {
      id: 'j1',
      carrier: { name: 'Rockland Coaches', code: 'RCK' },
      route: { longName: '20' },
      trip: { headsign: 'Tenafly' },
      origin: { sequence: 1, farezone: '1', stop: { name: 'PABT', platform: null, location: { latitude: 0, longitude: 0 } }, arrival: null, departure: { time: '2026-11-19T19:30:00-05:00', approximate: false } },
      destination: { sequence: 5, farezone: '5', stop: { name: 'Hillside', platform: null, location: { latitude: 0, longitude: 0 } }, arrival: { time: '2026-11-19T20:10:00-05:00', approximate: false }, departure: null },
      stops: [],
    },
  ],
};

beforeEach(() => {
  jest.useFakeTimers({ advanceTimers: true });
  calls = 0;
  responses = [];
  globalThis.fetch = jest.fn(async () => {
    calls++;
    const next = responses.shift() ?? 200;
    if (next === 'network') throw new TypeError('fetch failed');
    return { ok: next === 200, status: next, json: async () => journey } as Response;
  }) as typeof fetch;
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- a fresh cache per test; jest can't import() here
  coach = require('./coachusa');
});

afterEach(() => jest.useRealTimers());

const trips = () => coach.getTrips('a', 'b', '2026-11-19');

describe('Coach USA blips', () => {
  it('retries once after a server error or a dropped connection', async () => {
    responses = [503];
    expect(await trips()).toHaveLength(1);
    responses = [];
    jest.setSystemTime(Date.now() + 10 * 60 * 1000);
    responses = ['network'];
    expect(await trips()).toHaveLength(1);
    expect(calls).toBe(4);
  });

  it('doesn’t retry a request Coach USA rejects', async () => {
    responses = [404];
    await expect(trips()).rejects.toThrow('coachusa /journey → 404');
    expect(calls).toBe(1);
  });

  it('fails with Coach USA named when both tries fail and nothing is saved', async () => {
    responses = [503, 503];
    await expect(trips()).rejects.toThrow(/^coachusa \/journey → 503/);
  });

  it('reuses a schedule for a few minutes instead of asking again', async () => {
    await trips();
    await trips();
    expect(calls).toBe(1);
  });

  it('serves the last good schedule when Coach USA fails later', async () => {
    await trips();
    jest.setSystemTime(Date.now() + 30 * 60 * 1000);
    responses = [503, 503];
    expect(await trips()).toHaveLength(1);
    expect(calls).toBe(3);
  });

  it('stops serving a saved schedule once it is hours old', async () => {
    await trips();
    jest.setSystemTime(Date.now() + 7 * 60 * 60 * 1000);
    responses = [503, 503];
    await expect(trips()).rejects.toThrow(/^coachusa/);
  });
});
