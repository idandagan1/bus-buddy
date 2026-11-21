// Matching live incidents to the stretch of road the next bus takes, and describing them.
import { act, renderHook } from '@testing-library/react-native';
import { track } from './analytics';
import { clearIncidents, incidentLine, incidentsOnTrip, isUrgent, loadIncidents, toSegmentMeters, useTraffic, wayOf } from './traffic';
import type { TrafficIncident, TripStop } from './types';

jest.mock('./analytics', () => ({ track: jest.fn() }));

// The 166 roughly: Tenafly, Englewood Cliffs, Fort Lee, Port Authority.
const stop = (name: string, latitude: number, longitude: number): TripStop => ({ name, time: '', latitude, longitude });
const tenafly = stop('Tenafly', 40.925, -73.963);
const cliffs = stop('Englewood Cliffs', 40.885, -73.952);
const fortLee = stop('Fort Lee', 40.851, -73.97);
const pabt = stop('Port Authority', 40.757, -73.99);
const trip = { stops: [tenafly, cliffs, fortLee, pabt] };
const inc = (id: string, points: [number, number][], extra: Partial<TrafficIncident> = {}): TrafficIncident => ({
  id,
  kind: 'accident',
  what: null,
  road: null,
  from: null,
  to: null,
  delayMin: null,
  until: null,
  points,
  ...extra,
});

describe('toSegmentMeters', () => {
  const a = { latitude: 40.89, longitude: -73.96 };
  const b = { latitude: 40.91, longitude: -73.96 };

  it('measures to the nearest point of a segment, or to its ends', () => {
    expect(toSegmentMeters({ latitude: 40.9, longitude: -73.96 }, a, b)).toBeLessThan(1);
    expect(toSegmentMeters({ latitude: 40.9, longitude: -73.95 }, a, b)).toBeCloseTo(842, -1);
    expect(toSegmentMeters({ latitude: 40.93, longitude: -73.96 }, a, b)).toBeCloseTo(2211, -1);
    expect(toSegmentMeters({ latitude: 40.9, longitude: -73.96 }, tenafly, tenafly)).toBeGreaterThan(2000);
  });
});

describe('wayOf', () => {
  it('takes the trip’s stops between where the rider gets on and off, either way round', () => {
    expect(wayOf(trip, tenafly, fortLee)).toEqual([tenafly, cliffs, fortLee]);
    expect(wayOf(trip, fortLee, tenafly)).toEqual([tenafly, cliffs, fortLee]);
  });

  it('falls back to the two stops for a trip without stops, or a ride of one stop', () => {
    expect(wayOf({ stops: [] }, tenafly, pabt)).toEqual([tenafly, pabt]);
    expect(wayOf({ stops: [tenafly] }, tenafly, pabt)).toEqual([tenafly, pabt]);
    expect(wayOf(trip, cliffs, cliffs)).toEqual([cliffs, cliffs]);
    expect(wayOf({ stops: [stop('x', NaN, 0), tenafly] }, tenafly, pabt)).toEqual([tenafly, pabt]);
  });
});

describe('incidentsOnTrip', () => {
  const between = inc('on-9w', [[40.905, -73.957]], { delayMin: 4 });
  const bigger = inc('fort-lee', [[40.851, -73.9705]], { delayMin: 12 });
  const offRoute = inc('closter', [[40.973, -73.961]]);
  const southOfRide = inc('lincoln', [[40.76, -73.99]]);

  it('finds incidents along the ride, the longest hold-up first', () => {
    expect(incidentsOnTrip([offRoute, between, bigger, southOfRide], trip, tenafly, fortLee).map((i) => i.id)).toEqual(['fort-lee', 'on-9w']);
  });

  it('matches any point of a long incident', () => {
    expect(incidentsOnTrip([inc('long', [[40.97, -73.9], [40.905, -73.957]])], trip, tenafly, fortLee)).toHaveLength(1);
  });

  it('finds nothing with nothing reported', () => {
    expect(incidentsOnTrip([], trip, tenafly, fortLee)).toEqual([]);
  });
});

describe('describing an incident', () => {
  it('names the kind, the road, where and the delay', () => {
    expect(incidentLine(inc('a', [], { road: 'US-9W', from: 'Clinton Ave', delayMin: 6 }))).toBe('🚨  Accident on US-9W near Clinton Ave · +6 min');
    expect(incidentLine(inc('b', [], { kind: 'road-works' }))).toBe('🚧  Road works');
    expect(incidentLine(inc('c', [], { kind: 'road-closed', from: 'Engle St' }))).toBe('⛔  Road closed near Engle St');
  });

  it('treats accidents, closures and flooding as urgent', () => {
    const kinds = (list: string[]) => list.map((kind) => isUrgent(inc('x', [], { kind: kind as TrafficIncident['kind'] })));
    expect(kinds(['accident', 'road-closed', 'flooding'])).toEqual([true, true, true]);
    expect(kinds(['danger', 'ice', 'lane-closed', 'road-works', 'broken-down'])).toEqual([false, false, false, false, false]);
  });
});

describe('loading incidents', () => {
  const fetchMock = jest.fn();
  const ok = (body: unknown) => ({ ok: true, json: async () => body }) as Response;

  beforeEach(() => {
    clearIncidents();
    jest.mocked(track).mockClear();
    fetchMock.mockReset().mockResolvedValue(ok([inc('a', [[40.9, -73.96]])]));
    globalThis.fetch = fetchMock;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('asks once per 20 minutes', async () => {
    jest.useFakeTimers({ now: Date.parse('2026-11-21T20:00:00Z') });
    await loadIncidents();
    await loadIncidents();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    jest.setSystemTime(Date.parse('2026-11-21T20:21:00Z'));
    await loadIncidents();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives nothing on a failure or a strange answer, logs why, and tries again next time', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 502, json: async () => ({}) } as Response)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(ok({ error: 'x' }))
      .mockResolvedValueOnce({ ok: true, json: () => Promise.reject(new SyntaxError('not JSON')) } as unknown as Response);
    for (let i = 0; i < 4; i++) expect(await loadIncidents()).toBeNull();
    expect(jest.mocked(track).mock.calls).toEqual([
      ['load_failed', { what: 'traffic', reason: 'server', status: 502 }],
      ['load_failed', { what: 'traffic', reason: 'offline' }],
      ['load_failed', { what: 'traffic', reason: 'bad answer' }],
      ['load_failed', { what: 'traffic', reason: 'offline' }],
    ]);
    expect(await loadIncidents()).toHaveLength(1);
  });

  it('keeps showing nothing new when a later check fails', async () => {
    const { result } = await renderHook(() => useTraffic(true));
    await act(async () => {});
    expect(result.current).toHaveLength(1);
    clearIncidents();
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) } as Response);
    expect(await loadIncidents()).toBeNull();
    expect(result.current).toHaveLength(1);
  });

  it('useTraffic loads only when asked', async () => {
    const { result, rerender } = await renderHook((enabled: boolean) => useTraffic(enabled), { initialProps: false });
    await act(async () => {});
    expect(result.current).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
    await rerender(true);
    await act(async () => {});
    expect(result.current).toHaveLength(1);
    await rerender(false);
    expect(result.current).toEqual([]);
  });

  it('useTraffic checks again every 20 minutes', async () => {
    jest.useFakeTimers({ now: Date.parse('2026-11-21T20:00:00Z') });
    await renderHook(() => useTraffic(true));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(20 * 60 * 1000 + 1);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
