// Asking for road work only in towns that publish it, and quietly showing nothing on a failure.
import { act, renderHook } from '@testing-library/react-native';
import { feedTowns, useRoadWork } from './roadWork';
import { hasTownFeed } from './townFeeds';

const notice = { town: 'Tenafly', title: 'JFC TENAFLY GAS WORK SCHEDULE', link: 'https://www.tenaflynj.gov/x', posted: '2026-11-19T20:08:00.000Z' };
const fetchMock = jest.fn();

beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue({ ok: true, json: async () => [notice] } as Response);
  globalThis.fetch = fetchMock;
});

it('knows which towns publish notices, whatever the spelling', () => {
  expect(hasTownFeed('Tenafly')).toBe(true);
  expect(hasTownFeed(' tenafly ')).toBe(true);
  expect(hasTownFeed('Cresskill')).toBe(false);
  expect(hasTownFeed('')).toBe(false);
  expect(hasTownFeed(null)).toBe(false);
  expect(hasTownFeed(undefined)).toBe(false);
});

it('lists the publishing towns among the stops, once', () => {
  expect(feedTowns([{ town: 'Tenafly' }, { town: 'New York' }, { town: 'Tenafly ' }, { town: '' }])).toEqual(['Tenafly']);
  expect(feedTowns([{ town: 'New York' }])).toEqual([]);
});

it('loads the notices for a route through Tenafly', async () => {
  const { result } = await renderHook(() => useRoadWork([{ town: 'Tenafly' }, { town: 'New York' }]));
  await act(async () => {});
  expect(result.current).toEqual([notice]);
  expect(fetchMock).toHaveBeenCalledWith('/api/roadwork?towns=Tenafly');
});

it('asks nothing for a route through towns without notices', async () => {
  const { result } = await renderHook(() => useRoadWork([{ town: 'Cresskill' }, { town: 'New York' }]));
  await act(async () => {});
  expect(result.current).toEqual([]);
  expect(fetchMock).not.toHaveBeenCalled();
});

it.each([
  ['an error status', () => fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) } as Response)],
  ['no connection', () => fetchMock.mockRejectedValue(new Error('offline'))],
  ['a strange answer', () => fetchMock.mockResolvedValue({ ok: true, json: async () => ({ error: 'x' }) } as Response)],
])('shows nothing on %s', async (_, setup) => {
  setup();
  const { result } = await renderHook(() => useRoadWork([{ town: 'Tenafly' }]));
  await act(async () => {});
  expect(result.current).toEqual([]);
});
