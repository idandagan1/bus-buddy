import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook } from '@testing-library/react-native';
import { useNetworkState } from 'expo-network';
import {
  dayKey,
  fetchTrips,
  findPartner,
  formatCountdown,
  formatDay,
  formatTime,
  loadRoutes,
  OfflineError,
  saveRoutes,
  searchStops,
  todayISO,
  useAdvisories,
  useNow,
  useTrips,
} from './api';
import type { Advisory, SavedRoute, Stop, Trip } from './types';

jest.mock('expo-network', () => ({ useNetworkState: jest.fn() }));
const networkState = useNetworkState as jest.Mock;

// 10:00 PM in New York on Nov 19, already Nov 20 in UTC.
const NOW = new Date('2026-11-20T03:00:00Z').getTime();

const reply = (status: number, body?: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: () => (body === undefined ? Promise.reject(new SyntaxError('no body')) : Promise.resolve(body)),
  }) as Response;

let fetchMock: jest.Mock;
const urlOf = (call: number) => new URL(fetchMock.mock.calls[call][0], 'http://x');
// Lets pending promises and timers run inside act().
const flush = (ms = 0) => act(() => jest.advanceTimersByTimeAsync(ms));

const stop = (id: string, latitude = 40.9, longitude = -73.9): Stop => ({ id, name: id, town: '', state: 'NJ', latitude, longitude });
const trip = (id: string, extra: Partial<Trip> = {}) =>
  ({ id, departure: '2026-11-19T19:30:00-05:00', arrival: '2026-11-19T20:10:00-05:00', carrierCode: 'RCK', fromZone: '1', toZone: '3', ...extra }) as Trip;

beforeEach(async () => {
  jest.useFakeTimers({ now: NOW });
  fetchMock = jest.fn();
  globalThis.fetch = fetchMock;
  networkState.mockReturnValue({ isConnected: true, isInternetReachable: true });
  await AsyncStorage.clear();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('formatTime', () => {
  it('shows New York time whatever the device zone', () => {
    expect(formatTime('2026-11-20T03:00:00Z')).toMatch(/^10:00\sPM$/);
  });

  it('handles midnight and noon', () => {
    expect(formatTime('2026-11-19T00:05:00-05:00')).toMatch(/^12:05\sAM$/);
    expect(formatTime('2026-11-19T12:00:00-05:00')).toMatch(/^12:00\sPM$/);
  });

  it('follows daylight saving time', () => {
    // Clocks went forward at 2 AM on Mar 8, 2026.
    expect(formatTime('2026-03-08T06:30:00Z')).toMatch(/^1:30\sAM$/);
    expect(formatTime('2026-03-08T07:30:00Z')).toMatch(/^3:30\sAM$/);
  });
});

describe('formatDay and dayKey', () => {
  it('use the New York date, not the UTC one', () => {
    expect(dayKey('2026-11-20T03:00:00Z')).toBe('2026-11-19');
    expect(formatDay('2026-11-20T03:00:00Z')).toBe('Thu, Nov 19');
    expect(dayKey('2026-11-20T05:00:00Z')).toBe('2026-11-20');
  });

  it('todayISO is today in New York', () => {
    expect(todayISO()).toBe('2026-11-19');
  });
});

describe('formatCountdown', () => {
  const inMin = (min: number) => new Date(NOW + min * 60000).toISOString();

  it.each([
    [0, 'now'],
    [-5, 'now'],
    [-24 * 60, 'now'],
    [0.4, 'now'],
    [0.5, 'in 1 min'],
    [1, 'in 1 min'],
    [59, 'in 59 min'],
    [59.6, 'in 1h 0m'],
    [60, 'in 1h 0m'],
    [135, 'in 2h 15m'],
    [24 * 60 - 1, 'in 23h 59m'],
    [24 * 60, 'in 1d 0h'],
    [50 * 60 + 30, 'in 2d 2h'],
  ])('%d min away → %s', (min, label) => {
    expect(formatCountdown(inMin(min), NOW)).toBe(label);
  });
});

describe('getJson', () => {
  it('passes the search and origin through', async () => {
    fetchMock.mockResolvedValue(reply(200, [stop('a')]));
    await expect(searchStops('port auth', 'tenafly')).resolves.toEqual([stop('a')]);
    expect(urlOf(0).pathname).toBe('/api/stops');
    expect(urlOf(0).searchParams.get('q')).toBe('port auth');
    expect(urlOf(0).searchParams.get('origin')).toBe('tenafly');
  });

  it('leaves out the origin when there is none', async () => {
    fetchMock.mockResolvedValue(reply(200, []));
    await searchStops('x');
    expect(urlOf(0).searchParams.has('origin')).toBe(false);
  });

  it('retries a server error once, after a second', async () => {
    fetchMock.mockResolvedValueOnce(reply(503)).mockResolvedValueOnce(reply(200, []));
    const result = searchStops('x');
    await jest.advanceTimersByTimeAsync(999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives up after the retry, blaming our server when there is no body', async () => {
    fetchMock.mockResolvedValue(reply(500));
    const result = searchStops('x');
    const assertion = expect(result).rejects.toThrow("Couldn't load stops: the Bus Buddy server had a hiccup.");
    await jest.advanceTimersByTimeAsync(1000);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('names the upstream that failed', async () => {
    fetchMock.mockResolvedValue(reply(502, { source: 'coachusa' }));
    const result = fetchTrips('a', 'b');
    const assertion = expect(result).rejects.toThrow("Couldn't load the schedule: Coach USA isn't responding.");
    await jest.advanceTimersByTimeAsync(1000);
    await assertion;
  });

  it('does not retry a client error', async () => {
    fetchMock.mockResolvedValue(reply(404, { source: 'njtransit' }));
    await expect(searchStops('x')).rejects.toThrow("Couldn't load stops: NJ Transit isn't responding.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to the generic message for an unknown source or a null body', async () => {
    fetchMock.mockResolvedValueOnce(reply(400, { source: 'septa' }));
    await expect(searchStops('x')).rejects.toThrow('the Bus Buddy server had a hiccup');
    fetchMock.mockResolvedValueOnce(reply(400, null));
    await expect(searchStops('x')).rejects.toThrow('the Bus Buddy server had a hiccup');
  });

  it('reports no connection when fetch itself fails, without retrying', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    const error = await searchStops('x').catch((e) => e);
    expect(error).toBeInstanceOf(OfflineError);
    expect(error.message).toBe('No internet connection');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('times out a stalled request after 15 seconds', async () => {
    fetchMock.mockImplementation(
      (_url: string, { signal }: RequestInit) =>
        new Promise((_, reject) => signal!.addEventListener('abort', () => reject(new Error('aborted')))),
    );
    const result = fetchTrips('a', 'b');
    const assertion = expect(result).rejects.toThrow("Couldn't load the schedule: the request timed out.");
    await jest.advanceTimersByTimeAsync(15000);
    await assertion;
  });

  it('looks up the partner by id and position, and passes on null', async () => {
    fetchMock.mockResolvedValue(reply(200, null));
    await expect(findPartner(stop('c1', 40.1, -74.2), stop('c2', 40.7, -73.9))).resolves.toBeNull();
    expect(urlOf(0).searchParams.get('from')).toBe('c1,40.1,-74.2');
    expect(urlOf(0).searchParams.get('to')).toBe('c2,40.7,-73.9');
  });
});

describe('fetchTrips', () => {
  it('asks for today in New York and keeps a copy', async () => {
    fetchMock.mockResolvedValue(reply(200, [trip('t1')]));
    await fetchTrips('a', 'b');
    expect(urlOf(0).searchParams.get('date')).toBe('2026-11-19');
    const saved = JSON.parse((await AsyncStorage.getItem('trips:a:b'))!);
    expect(saved).toEqual({ savedAt: NOW, trips: [trip('t1')] });
  });

  it('still returns the trips when saving the copy fails', async () => {
    fetchMock.mockResolvedValue(reply(200, [trip('t1')]));
    (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
    await expect(fetchTrips('a', 'b')).resolves.toEqual([trip('t1')]);
  });

  it('keeps the old copy when loading fails', async () => {
    await AsyncStorage.setItem('trips:a:b', JSON.stringify({ savedAt: 1, trips: [trip('old')] }));
    fetchMock.mockRejectedValue(new TypeError('offline'));
    await expect(fetchTrips('a', 'b')).rejects.toBeInstanceOf(OfflineError);
    expect(JSON.parse((await AsyncStorage.getItem('trips:a:b'))!).trips[0].id).toBe('old');
  });
});

describe('loadRoutes / saveRoutes', () => {
  const route: SavedRoute = { id: 'r1', from: stop('a'), to: stop('b'), only: ['166X'], also: { from: stop('n1'), to: stop('n2') } };

  it('has no routes on first launch', async () => {
    await expect(loadRoutes()).resolves.toEqual([]);
  });

  it('reads back what was saved', async () => {
    await saveRoutes([route]);
    await expect(loadRoutes()).resolves.toEqual([route]);
  });

  it('saves an empty list', async () => {
    await saveRoutes([route]);
    await saveRoutes([]);
    await expect(loadRoutes()).resolves.toEqual([]);
  });

  it('reads routes saved before filters and the other carrier existed', async () => {
    const legacy = { id: 'r0', from: stop('a'), to: stop('b') };
    await AsyncStorage.setItem('savedRoutes', JSON.stringify([legacy]));
    const [loaded] = await loadRoutes();
    expect(loaded).toEqual(legacy);
    expect(loaded.only).toBeUndefined();
    expect(loaded.also).toBeUndefined();
  });

  it('treats corrupt saved routes as none', async () => {
    await AsyncStorage.setItem('savedRoutes', '[{"id":');
    await expect(loadRoutes()).resolves.toEqual([]);
  });
});

describe('useTrips', () => {
  const a = stop('a');
  const b = stop('b');
  const cacheTrips = (trips: unknown, savedAt?: number) =>
    AsyncStorage.setItem('trips:a:b', JSON.stringify(savedAt === undefined ? trips : { savedAt, trips }));

  it('loads nothing without both stops', async () => {
    const { result, rerender } = await renderHook(({ from, to }: { from: Stop | null; to: Stop | null }) => useTrips(from, to), {
      initialProps: { from: null as Stop | null, to: b as Stop | null },
    });
    await flush();
    await rerender({ from: a, to: null });
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current).toMatchObject({ trips: null, error: null, offline: false, cachedAt: null });
    await act(() => result.current.reload());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('loads fresh trips', async () => {
    fetchMock.mockResolvedValue(reply(200, [trip('t1')]));
    const { result } = await renderHook(() => useTrips(a, b));
    await flush();
    expect(result.current).toMatchObject({ trips: [trip('t1')], error: null, offline: false, cachedAt: null });
  });

  it('shows the saved copy, marked with when it was saved, until fresh data arrives', async () => {
    await cacheTrips([trip('old')], NOW - 60000);
    let respond!: (r: Response) => void;
    fetchMock.mockReturnValue(new Promise((r) => (respond = r)));
    const { result } = await renderHook(() => useTrips(a, b));
    await flush();
    expect(result.current).toMatchObject({ trips: [trip('old')], cachedAt: NOW - 60000 });
    respond(reply(200, [trip('new')]));
    await flush();
    expect(result.current).toMatchObject({ trips: [trip('new')], cachedAt: null });
  });

  it('reads a copy saved by older builds as a bare array, with no saved time', async () => {
    await cacheTrips([trip('old')]);
    fetchMock.mockReturnValue(new Promise(() => {}));
    const { result } = await renderHook(() => useTrips(a, b));
    await flush();
    expect(result.current).toMatchObject({ trips: [trip('old')], cachedAt: null });
  });

  it('never replaces fresh trips with a slower cache read', async () => {
    await cacheTrips([trip('old')], 1);
    fetchMock.mockResolvedValue(reply(200, [trip('new')]));
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    (AsyncStorage.getItem as jest.Mock).mockImplementationOnce(async (key: string) => {
      await gate;
      return AsyncStorage.multiGet([key]).then(([[, v]]) => v);
    });
    const { result } = await renderHook(() => useTrips(a, b));
    await flush();
    release();
    await flush();
    expect(result.current.trips).toEqual([trip('new')]);
  });

  it('keeps showing the saved copy with the error when loading fails', async () => {
    await cacheTrips([trip('old')], 5);
    fetchMock.mockImplementation(() => new Promise((_, reject) => setTimeout(() => reject(new TypeError('offline')), 100)));
    const { result } = await renderHook(() => useTrips(a, b));
    await flush(100);
    expect(result.current).toMatchObject({ trips: [trip('old')], error: 'No internet connection', offline: true, cachedAt: 5 });
  });

  it('keeps the error when loading fails before the saved copy is read', async () => {
    await cacheTrips([trip('old')], 5);
    fetchMock.mockRejectedValue(new TypeError('offline'));
    const { result } = await renderHook(() => useTrips(a, b));
    await flush();
    expect(result.current).toMatchObject({ trips: [trip('old')], error: 'No internet connection', offline: true, cachedAt: 5 });
  });

  it('reports the error with nothing to show', async () => {
    fetchMock.mockResolvedValue(reply(404));
    const { result } = await renderHook(() => useTrips(a, b));
    await flush();
    expect(result.current).toMatchObject({ trips: null, error: "Couldn't load the schedule: the Bus Buddy server had a hiccup.", offline: false });
  });

  it('ignores a corrupt saved copy and loads fresh trips', async () => {
    await AsyncStorage.setItem('trips:a:b', '{not json');
    fetchMock.mockResolvedValue(reply(200, [trip('new')]));
    const { result } = await renderHook(() => useTrips(a, b));
    await flush();
    expect(result.current.trips).toEqual([trip('new')]);
  });

  it('never shows the other direction’s trips after switching', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, [trip('a→b')])).mockReturnValueOnce(new Promise(() => {}));
    const { result, rerender } = await renderHook(({ from, to }: { from: Stop; to: Stop }) => useTrips(from, to), { initialProps: { from: a, to: b } });
    await flush();
    expect(result.current.trips).toEqual([trip('a→b')]);
    await rerender({ from: b, to: a });
    expect(result.current.trips).toBeNull();
    await flush();
    expect(result.current.trips).toBeNull();
  });

  it('refetches every five minutes, keeping the last trips through a failure', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, [trip('t1')])).mockRejectedValueOnce(new TypeError('offline'));
    const { result } = await renderHook(() => useTrips(a, b));
    await flush();
    await flush(5 * 60 * 1000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current).toMatchObject({ trips: [trip('t1')], error: 'No internet connection', offline: true });
  });

  it('is offline when the network says so, and refetches when it comes back', async () => {
    networkState.mockReturnValue({ isConnected: false, isInternetReachable: false });
    fetchMock.mockRejectedValueOnce(new TypeError('offline')).mockResolvedValueOnce(reply(200, [trip('t1')]));
    const { result, rerender } = await renderHook(() => useTrips(a, b));
    await flush();
    expect(result.current.offline).toBe(true);
    networkState.mockReturnValue({ isConnected: true, isInternetReachable: true });
    await rerender({});
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current).toMatchObject({ trips: [trip('t1')], offline: false, error: null });
  });

  it('does not refetch when the first network check settles as online', async () => {
    networkState.mockReturnValue({ isConnected: null, isInternetReachable: null });
    fetchMock.mockResolvedValue(reply(200, []));
    const { rerender } = await renderHook(() => useTrips(a, b));
    await flush();
    networkState.mockReturnValue({ isConnected: true, isInternetReachable: true });
    await rerender({});
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('useNow', () => {
  it('ticks on its interval', async () => {
    const { result } = await renderHook(() => useNow(1000));
    expect(result.current).toBe(NOW);
    await flush(1000);
    expect(result.current).toBe(NOW + 1000);
  });
});

describe('useAdvisories', () => {
  const advisory: Advisory = { id: 'x', heading: 'Detour', severity: 'high', paragraphs: [], updated: null };

  it('asks for nothing without trips', async () => {
    const { result, rerender } = await renderHook(({ trips }: { trips: Trip[] | null }) => useAdvisories(trips), { initialProps: { trips: null } });
    await rerender({ trips: [] });
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current).toEqual([]);
  });

  it('asks by the first trip’s carrier and zones', async () => {
    fetchMock.mockResolvedValue(reply(200, [advisory]));
    const trips = [trip('t1'), trip('t2', { carrierCode: 'NJT' })];
    const { result } = await renderHook(() => useAdvisories(trips));
    await flush();
    expect(urlOf(0).pathname).toBe('/api/advisories');
    expect(Object.fromEntries(urlOf(0).searchParams)).toEqual({ carrier: 'RCK', fromZone: '1', toZone: '3' });
    expect(result.current).toEqual([advisory]);
  });

  it('sends empty zones when a trip has none', async () => {
    fetchMock.mockResolvedValue(reply(200, []));
    const trips = [trip('t1', { fromZone: null, toZone: null })];
    await renderHook(() => useAdvisories(trips));
    await flush();
    expect(urlOf(0).searchParams.get('fromZone')).toBe('');
    expect(urlOf(0).searchParams.get('toZone')).toBe('');
  });

  it('shows none when the server errors or the request fails', async () => {
    fetchMock.mockResolvedValueOnce(reply(500));
    const coachTrips = [trip('t1')];
    const first = await renderHook(() => useAdvisories(coachTrips));
    await flush();
    expect(first.result.current).toEqual([]);
    fetchMock.mockRejectedValueOnce(new TypeError('offline'));
    const njtTrips = [trip('t1', { carrierCode: 'NJT' })];
    const second = await renderHook(() => useAdvisories(njtTrips));
    await flush();
    expect(second.result.current).toEqual([]);
  });

  it('drops one route’s alerts as soon as the trips change carrier', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, [advisory])).mockReturnValueOnce(new Promise(() => {}));
    const { result, rerender } = await renderHook(({ trips }: { trips: Trip[] }) => useAdvisories(trips), { initialProps: { trips: [trip('t1')] } });
    await flush();
    expect(result.current).toEqual([advisory]);
    await rerender({ trips: [trip('t1', { carrierCode: 'NJT' })] });
    expect(result.current).toEqual([]);
  });

  it('refreshes every five minutes and stops after unmount', async () => {
    fetchMock.mockResolvedValue(reply(200, []));
    const trips = [trip('t1')];
    const { unmount } = await renderHook(() => useAdvisories(trips));
    await flush();
    await flush(5 * 60 * 1000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await unmount();
    await flush(10 * 60 * 1000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
