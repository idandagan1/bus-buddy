// GET /api/weather with the services faked: which places are accepted, and how failures come back.
import { forecastAt } from '@/server/weather';
import { GET } from '@/app/api/weather+api';

jest.mock('@/server/weather', () => ({ forecastAt: jest.fn() }));
const forecast = forecastAt as jest.MockedFunction<typeof forecastAt>;
const sunny = { source: 'open-meteo' as const, today: 'clear' as const, hours: [] };

beforeEach(() => {
  forecast.mockReset().mockResolvedValue(sunny);
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

const get = (query: string) => GET(new Request(`http://site.test/api/weather${query}`));

describe('GET /api/weather', () => {
  it('forecasts the place, cached for half an hour', async () => {
    const res = await get('?lat=40.93&lon=-73.96');
    expect(forecast).toHaveBeenCalledWith(40.93, -73.96);
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=1800');
    expect(await res.json()).toEqual(sunny);
  });

  it.each(['', '?lat=40.93', '?lon=-73.96', '?lat=&lon=', '?lat=abc&lon=-73.96', '?lat=91&lon=0', '?lat=0&lon=181'])('turns away %s', async (q) => {
    const res = await get(q);
    expect(res.status).toBe(400);
    expect(forecast).not.toHaveBeenCalled();
  });

  it('says so when no service answers', async () => {
    forecast.mockRejectedValue(new Error('down'));
    const res = await get('?lat=40.93&lon=-73.96');
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'Weather unavailable', source: 'weather' });
  });
});
