// GET /api/partner with the pairing faked: which places are accepted, and how failures come back.
import { findPartner } from '@/server/transit';
import { GET } from '@/app/api/partner+api';

jest.mock('@/server/transit', () => ({ findPartner: jest.fn() }));
const partner = findPartner as jest.MockedFunction<typeof findPartner>;

beforeEach(() => {
  partner.mockReset().mockResolvedValue(null);
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

const get = (query: string) => GET(new Request(`http://site.test/api/partner${query}`));
const FROM = 'c-hillside,40.92515,-73.96425';
const TO = 'c-pabt,40.7569,-73.9903';

describe('GET /api/partner', () => {
  it('reads both places and pairs them', async () => {
    const res = await get(`?from=${FROM}&to=${TO}`);
    expect(partner).toHaveBeenCalledWith(
      'http://site.test',
      { id: 'c-hillside', latitude: 40.92515, longitude: -73.96425 },
      { id: 'c-pabt', latitude: 40.7569, longitude: -73.9903 },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=86400');
    expect(await res.json()).toBeNull();
  });

  it('returns the pair it finds', async () => {
    const stop = { id: 'njt:s1', name: 'A', town: '', state: '', latitude: 1, longitude: 2, carrier: 'NJT' as const };
    partner.mockResolvedValue({ from: stop, to: stop });
    expect(await (await get(`?from=${FROM}&to=${TO}`)).json()).toEqual({ from: stop, to: stop });
  });

  it('accepts NJ Transit ids, encoded commas, zero and exponent coordinates', async () => {
    await get(`?from=njt%3As13893%2C0%2C-0&to=njt:s31899,4.07e1,-7.399e1`);
    expect(partner).toHaveBeenCalledWith('http://site.test', { id: 'njt:s13893', latitude: 0, longitude: -0 }, { id: 'njt:s31899', latitude: 40.7, longitude: -73.99 });
  });

  it.each([
    ['nothing', ''],
    ['no to', `?from=${FROM}`],
    ['no from', `?to=${TO}`],
    ['empty from', `?from=&to=${TO}`],
    ['no id', `?from=,40.9,-73.9&to=${TO}`],
    ['no longitude', `?from=c-a,40.9&to=${TO}`],
    ['only an id', `?from=c-a&to=${TO}`],
    ['words for numbers', `?from=c-a,north,west&to=${TO}`],
    ['NaN', `?from=${FROM}&to=c-b,NaN,-73.9`],
    ['Infinity', `?from=${FROM}&to=c-b,40.7,Infinity`],
    ['a number with junk after it', `?from=${FROM}&to=c-b,40.7abc,-73.9`],
  ])('answers 400 for %s', async (_, query) => {
    const res = await get(query);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'from and to are id,lat,lon' });
    expect(partner).not.toHaveBeenCalled();
  });

  it('answers 400 for blank coordinates', async () => {
    const res = await get(`?from=c-a,,&to=${TO}`);
    expect(res.status).toBe(400);
    expect(partner).not.toHaveBeenCalled();
  });

  it.each([
    ['coachusa /journey/location → 503', 'coachusa'],
    ['njtransit index.json → 404', 'njtransit'],
    ['boom', 'server'],
  ])('answers 502 naming who failed: %s', async (message, source) => {
    partner.mockRejectedValue(new Error(message));
    const res = await get(`?from=${FROM}&to=${TO}`);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: message, source });
  });
});
