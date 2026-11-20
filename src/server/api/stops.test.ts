// GET /api/stops with stop search faked: what reaches it from the query string, and how failures come back.
import { searchStops } from '@/server/transit';
import { GET } from '@/app/api/stops+api';

jest.mock('@/server/transit', () => ({ searchStops: jest.fn() }));
const search = searchStops as jest.MockedFunction<typeof searchStops>;

beforeEach(() => {
  search.mockReset().mockResolvedValue([]);
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

const get = (query: string) => GET(new Request(`http://site.test/api/stops${query}`));

describe('GET /api/stops', () => {
  it('searches with the query, the origin and this server’s own address', async () => {
    await get('?q=Tenafly&origin=njt:s13893');
    expect(search).toHaveBeenCalledWith('http://site.test', 'Tenafly', 'njt:s13893');
  });

  it('browses everything when there’s no query, and has no origin when none is given', async () => {
    await get('');
    expect(search).toHaveBeenCalledWith('http://site.test', '', undefined);
  });

  it('passes an empty origin through, which search treats as none', async () => {
    await get('?q=x&origin=');
    expect(search).toHaveBeenCalledWith('http://site.test', 'x', '');
  });

  it('decodes the query', async () => {
    await get('?q=Caf%C3%A9+%26+Co%20%20x');
    expect(search).toHaveBeenCalledWith('http://site.test', 'Café & Co  x', undefined);
  });

  it('takes the first of repeated params', async () => {
    await get('?q=a&q=b&origin=c1&origin=c2');
    expect(search).toHaveBeenCalledWith('http://site.test', 'a', 'c1');
  });

  it('returns the stops as JSON, cached for an hour', async () => {
    search.mockResolvedValue([{ id: 'c-1', name: 'A', town: 'T', state: 'NJ', latitude: 1, longitude: 2 }]);
    const res = await get('?q=a');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=3600');
    expect(await res.json()).toEqual([{ id: 'c-1', name: 'A', town: 'T', state: 'NJ', latitude: 1, longitude: 2 }]);
  });

  it('returns an empty list as is', async () => {
    expect(await (await get('?q=zzz')).json()).toEqual([]);
  });

  it.each([
    ['coachusa /journey/location → 503', 'coachusa'],
    ['njtransit index.json → 404', 'njtransit'],
    ['results.filter is not a function', 'server'],
  ])('answers 502 naming who failed: %s', async (message, source) => {
    search.mockRejectedValue(new Error(message));
    const res = await get('?q=a');
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: message, source });
  });

  it('blames Coach USA for a broken Coach USA answer', async () => {
    globalThis.fetch = jest.fn(async (input: RequestInfo | URL) =>
      String(input).includes('/journey/location')
        ? ({ ok: true, status: 200, json: async () => JSON.parse('<html>') } as Response)
        : ({ ok: false, status: 404, json: async () => null } as Response),
    ) as typeof fetch;
    search.mockImplementation(jest.requireActual<typeof import('@/server/transit')>('@/server/transit').searchStops);
    expect(await (await get('?q=a')).json()).toMatchObject({ source: 'coachusa' });
  });
});
