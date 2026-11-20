import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook } from '@testing-library/react-native';
import { usePartner, useRouteTrips } from './routeTrips';
import type { Leg, SavedRoute, Stop, Trip } from './types';

jest.mock('expo-network', () => ({ useNetworkState: () => ({ isConnected: true, isInternetReachable: true }) }));

const reply = (status: number, body?: unknown) =>
  ({ ok: status < 300, status, json: () => (body === undefined ? Promise.reject(new SyntaxError()) : Promise.resolve(body)) }) as Response;

const stop = (id: string, extra: Partial<Stop> = {}): Stop => ({ id, name: id, town: '', state: '', latitude: 40.9, longitude: -73.9, ...extra });
const trip = (id: string, departure: string) =>
  ({ id, departure: `2026-11-19T${departure}:00-05:00`, arrival: `2026-11-19T${departure}:59-05:00` }) as Trip;

const coach = { from: stop('c-ten'), to: stop('c-pa') };
const njt: Leg = { from: stop('njt-ten', { carrier: 'NJT' }), to: stop('njt-pa', { carrier: 'NJT' }) };
const route: SavedRoute = { id: 'r', ...coach };
const both: SavedRoute = { ...route, also: njt };

// Schedules by "from>to"; a number is an error status, missing pairs never answer.
let schedules: Record<string, Trip[] | number>;
let fetchMock: jest.Mock;
const fetched = () => fetchMock.mock.calls.map(([url]) => new URL(url, 'http://x')).map((u) => `${u.searchParams.get('from')}>${u.searchParams.get('to')}`);
const flush = (ms = 0) => act(() => jest.advanceTimersByTimeAsync(ms));

beforeEach(async () => {
  jest.useFakeTimers({ now: new Date('2026-11-19T17:00:00-05:00') });
  schedules = {};
  fetchMock = jest.fn(async (url: string) => {
    const u = new URL(url, 'http://x');
    const answer = schedules[`${u.searchParams.get('from')}>${u.searchParams.get('to')}`];
    if (answer === undefined) return new Promise(() => {});
    return typeof answer === 'number' ? reply(answer) : reply(200, answer);
  });
  globalThis.fetch = fetchMock;
  await AsyncStorage.clear();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useRouteTrips', () => {
  it('loads only the route’s own carrier without the other one added', async () => {
    schedules['c-ten>c-pa'] = [trip('coach', '19:30')];
    const { result } = await renderHook(() => useRouteTrips(route, false));
    await flush();
    expect(fetched()).toEqual(['c-ten>c-pa']);
    expect(result.current.trips?.map((t) => t.id)).toEqual(['coach']);
    expect(result.current.legs).toEqual([[trip('coach', '19:30')], null]);
  });

  it('merges both carriers by departure', async () => {
    schedules['c-ten>c-pa'] = [trip('coach 7:30', '19:30'), trip('coach 8:00', '20:00')];
    schedules['njt-ten>njt-pa'] = [trip('166 7:45', '19:45')];
    const { result } = await renderHook(() => useRouteTrips(both, false));
    await flush();
    expect(result.current.trips?.map((t) => t.id)).toEqual(['coach 7:30', '166 7:45', 'coach 8:00']);
    expect(result.current.legs[1]?.map((t) => t.id)).toEqual(['166 7:45']);
    expect(result.current.error).toBeNull();
  });

  it('asks both carriers for the ride back when reversed', async () => {
    await renderHook(() => useRouteTrips(both, true));
    await flush();
    expect(fetched().sort()).toEqual(['c-pa>c-ten', 'njt-pa>njt-ten']);
  });

  it('shows the other carrier’s buses, without an error, when the route’s own carrier fails', async () => {
    schedules['c-ten>c-pa'] = 404;
    schedules['njt-ten>njt-pa'] = [trip('166', '19:45')];
    const { result } = await renderHook(() => useRouteTrips(both, false));
    await flush();
    expect(result.current.trips?.map((t) => t.id)).toEqual(['166']);
    expect(result.current.error).toBeNull();
  });

  it('shows the route’s own buses when the other carrier fails', async () => {
    schedules['c-ten>c-pa'] = [trip('coach', '19:30')];
    schedules['njt-ten>njt-pa'] = 404;
    const { result } = await renderHook(() => useRouteTrips(both, false));
    await flush();
    expect(result.current.trips?.map((t) => t.id)).toEqual(['coach']);
    expect(result.current.error).toBeNull();
  });

  it('counts an empty schedule as something to show', async () => {
    schedules['c-ten>c-pa'] = [];
    schedules['njt-ten>njt-pa'] = 404;
    const { result } = await renderHook(() => useRouteTrips(both, false));
    await flush();
    expect(result.current.trips).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('reports the route’s own error when neither carrier has anything', async () => {
    schedules['c-ten>c-pa'] = 404;
    schedules['njt-ten>njt-pa'] = 404;
    const { result } = await renderHook(() => useRouteTrips(both, false));
    await flush();
    expect(result.current.trips).toBeNull();
    expect(result.current.error).toMatch(/^Couldn't load the schedule/);
  });

  it('reports the other carrier’s error while the route’s own is still loading', async () => {
    schedules['njt-ten>njt-pa'] = 404;
    const { result } = await renderHook(() => useRouteTrips(both, false));
    await flush();
    expect(result.current.trips).toBeNull();
    expect(result.current.error).toMatch(/^Couldn't load the schedule/);
  });

  it('has no error while both are still loading', async () => {
    const { result } = await renderHook(() => useRouteTrips(both, false));
    await flush();
    expect(result.current).toMatchObject({ trips: null, error: null });
  });

  it('reloads both carriers', async () => {
    schedules['c-ten>c-pa'] = [];
    schedules['njt-ten>njt-pa'] = [];
    const { result } = await renderHook(() => useRouteTrips(both, false));
    await flush();
    fetchMock.mockClear();
    await act(() => result.current.reload());
    expect(fetched().sort()).toEqual(['c-ten>c-pa', 'njt-ten>njt-pa']);
  });

  it('drops the other carrier’s buses once it is taken off the route', async () => {
    schedules['c-ten>c-pa'] = [trip('coach', '19:30')];
    schedules['njt-ten>njt-pa'] = [trip('166', '19:45')];
    const { result, rerender } = await renderHook(({ r }: { r: SavedRoute }) => useRouteTrips(r, false), { initialProps: { r: both } });
    await flush();
    expect(result.current.trips).toHaveLength(2);
    await rerender({ r: route });
    expect(result.current.trips?.map((t) => t.id)).toEqual(['coach']);
    expect(result.current.legs[1]).toBeNull();
  });
});

describe('usePartner', () => {
  // Lookups are cached for the app's lifetime, so each test uses its own stops.
  let n = 0;
  const fresh = (): SavedRoute => {
    n++;
    return { id: `p${n}`, from: stop(`a${n}`), to: stop(`b${n}`) };
  };
  const partnerReply = (body: unknown) => fetchMock.mockImplementation(async () => reply(200, body));

  it('is undefined while looking, then the other carrier’s stops', async () => {
    let respond!: (r: Response) => void;
    fetchMock.mockReturnValue(new Promise((r) => (respond = r)));
    const r = fresh();
    const { result } = await renderHook(() => usePartner(r));
    expect(result.current).toBeUndefined();
    respond(reply(200, njt));
    await flush();
    expect(result.current).toEqual(njt);
  });

  it('is null when the other carrier has nothing there', async () => {
    partnerReply(null);
    const r = fresh();
    const { result } = await renderHook(() => usePartner(r));
    await flush();
    expect(result.current).toBeNull();
  });

  it('is null, not stuck looking, when the lookup fails', async () => {
    fetchMock.mockRejectedValue(new TypeError('offline'));
    const r = fresh();
    const { result } = await renderHook(() => usePartner(r));
    await flush();
    expect(result.current).toBeNull();
  });

  it('looks up each pair of stops only once', async () => {
    partnerReply(njt);
    const r = fresh();
    const first = await renderHook(() => usePartner(r));
    await flush();
    await first.unmount();
    const copy = { ...r, id: 'copy' };
    const second = await renderHook(() => usePartner(copy));
    await flush();
    expect(second.result.current).toEqual(njt);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not look when the route already has the other carrier', async () => {
    const r = { ...fresh(), also: njt };
    const { result } = await renderHook(() => usePartner(r));
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current).toBeUndefined();
  });

  it('never shows one route’s partner on another', async () => {
    partnerReply(njt);
    const { result, rerender } = await renderHook(({ r }: { r: SavedRoute }) => usePartner(r), { initialProps: { r: fresh() } });
    await flush();
    expect(result.current).toEqual(njt);
    fetchMock.mockReturnValue(new Promise(() => {}));
    await rerender({ r: fresh() });
    expect(result.current).toBeUndefined();
  });
});
