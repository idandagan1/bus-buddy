import { act, renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { statusKey, summarize, useTripStatuses } from './live';
import type { Trip, TripStatus } from './types';

const NOW = new Date('2026-11-19T19:00:00-05:00').getTime();
const minutes = (min: number) => new Date(NOW + min * 60000).toISOString();
const trip = (id: string, departMin: number, rideMin = 40, extra: Partial<Trip> = {}) =>
  ({ id, journeyId: id, serviceDate: '20261119', departure: minutes(departMin), arrival: minutes(departMin + rideMin), ...extra }) as Trip;
const status = (over: Partial<TripStatus> = {}): TripStatus => ({
  state: 'SCHEDULED',
  vehicle: null,
  departure: { scheduled: minutes(10) },
  arrival: { scheduled: minutes(50) },
  position: null,
  retrieved: null,
  ...over,
});

const reply = (ok: boolean, body: unknown) => ({ ok, json: () => Promise.resolve(body) }) as Response;
let fetchMock: jest.Mock;
const asked = (call: number) => new URL(fetchMock.mock.calls[call][0], 'http://x').searchParams.get('trips')?.split(',');
const flush = (ms = 0) => act(() => jest.advanceTimersByTimeAsync(ms));

let appStateListener: ((state: string) => void) | undefined;
const removeListener = jest.fn();

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
  fetchMock = jest.fn(async () => reply(true, {}));
  globalThis.fetch = fetchMock;
  removeListener.mockClear();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    appStateListener = listener as (state: string) => void;
    return { remove: removeListener } as unknown as ReturnType<typeof AppState.addEventListener>;
  });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useTripStatuses', () => {
  it('asks for nothing without trips', async () => {
    for (const trips of [null, undefined, []]) {
      const { result } = await renderHook(() => useTripStatuses(trips, NOW));
      expect(result.current).toEqual({});
    }
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('only tracks trips about to leave or on the road', async () => {
    const trips = [
      trip('long-gone', -300),
      trip('arrived-2h-ago', -160),
      trip('riding', -20),
      trip('soon', 30),
      trip('in-89min', 89),
      trip('in-2h', 120),
    ];
    await renderHook(() => useTripStatuses(trips, NOW));
    await flush();
    expect(asked(0)).toEqual(['arrived-2h-ago@20261119', 'riding@20261119', 'soon@20261119', 'in-89min@20261119']);
  });

  it('skips trips with no journey id', async () => {
    const trips = [trip('a', 10, 40, { journeyId: '' }), trip('b', 10)];
    await renderHook(() => useTripStatuses(trips, NOW));
    await flush();
    expect(asked(0)).toEqual(['b@20261119']);
  });

  it('asks for at most twelve trips', async () => {
    const trips = Array.from({ length: 20 }, (_, i) => trip(`t${i}`, i));
    await renderHook(() => useTripStatuses(trips, NOW));
    await flush();
    expect(asked(0)).toHaveLength(12);
    expect(asked(0)?.[0]).toBe('t0@20261119');
  });

  it('keeps statuses by trip and adds new ones as they come', async () => {
    const trips = [trip('a', 10)];
    const s = status();
    fetchMock.mockResolvedValueOnce(reply(true, { [statusKey(trips[0])]: s })).mockResolvedValueOnce(reply(true, { other: null }));
    const { result } = await renderHook(() => useTripStatuses(trips, NOW));
    await flush();
    expect(result.current).toEqual({ 'a@20261119': s });
    await flush(15000);
    expect(result.current).toEqual({ 'a@20261119': s, other: null });
  });

  it('keeps the last statuses through server errors and dropped connections', async () => {
    const trips = [trip('a', 10)];
    const s = status();
    fetchMock
      .mockResolvedValueOnce(reply(true, { 'a@20261119': s }))
      .mockResolvedValueOnce(reply(false, { 'a@20261119': null }))
      .mockRejectedValueOnce(new TypeError('offline'));
    const { result } = await renderHook(() => useTripStatuses(trips, NOW));
    await flush();
    await flush(15000);
    await flush(15000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.current).toEqual({ 'a@20261119': s });
  });

  it('catches up when the app comes back, and stops when unmounted', async () => {
    const trips = [trip('a', 10)];
    const { unmount } = await renderHook(() => useTripStatuses(trips, NOW));
    await flush();
    await act(async () => appStateListener?.('active'));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await unmount();
    expect(removeListener).toHaveBeenCalled();
    await flush(60000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('ignores a reply that lands after unmount', async () => {
    let respond!: (r: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise((r) => (respond = r)));
    const trips = [trip('a', 10)];
    const { result, unmount } = await renderHook(() => useTripStatuses(trips, NOW));
    await unmount();
    respond(reply(true, { 'a@20261119': status() }));
    await flush();
    expect(result.current).toEqual({});
  });
});

describe('summarize, more cases', () => {
  const before = NOW;

  it('treats undefined like no status', () => {
    expect(summarize(undefined, before)).toBeNull();
  });

  it('counts a minute either way as on time', () => {
    const s = summarize(status({ departure: { scheduled: minutes(10), estimated: minutes(11) } }), before);
    expect(s).toMatchObject({ text: 'On time', tone: 'good' });
  });

  it('says how early it is leaving', () => {
    const s = summarize(status({ departure: { scheduled: minutes(10), estimated: minutes(7) } }), before);
    expect(s).toMatchObject({ text: 'Leaving 3 min early', stage: 'upcoming', tone: 'good' });
  });

  it('marks ten minutes or more as bad, judged by the worse of leaving and arriving', () => {
    const late = summarize(status({ departure: { scheduled: minutes(10), estimated: minutes(20) } }), before);
    expect(late).toMatchObject({ text: 'Leaving 10 min late', tone: 'bad' });
    const lateArrival = summarize(
      status({ departure: { scheduled: minutes(10), estimated: minutes(10) }, arrival: { scheduled: minutes(50), estimated: minutes(62) } }),
      before,
    );
    expect(lateArrival).toMatchObject({ text: 'On time', tone: 'bad', arrivalDelayMin: 12 });
  });

  it('accepts either spelling of canceled', () => {
    expect(summarize(status({ state: 'CANCELLED' }), before)?.stage).toBe('canceled');
  });

  it('counts a completed trip as arrived even before its arrival time', () => {
    expect(summarize(status({ state: 'COMPLETED' }), before)).toMatchObject({ stage: 'arrived', live: false });
  });

  it('counts the bus as gone once its estimated departure has passed', () => {
    const s = summarize(status({ departure: { scheduled: minutes(10), estimated: minutes(-2) } }), before);
    expect(s).toMatchObject({ stage: 'departed', departure: minutes(-2) });
  });

  it('passes the vehicle through', () => {
    expect(summarize(status({ vehicle: '7123', departure: { scheduled: minutes(10), estimated: minutes(10) } }), before)?.vehicle).toBe('7123');
  });
});
