// Reading both weather services, and falling back from Open-Meteo to the National Weather Service.
import { forecastAt, nws, openMeteo, skyOfCode, skyOfText } from './weather';

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
const fail = (status: number) => ({ ok: false, status, json: async () => ({}) }) as Response;
const fetchMock = jest.fn();

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock;
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

const H5 = Date.parse('2026-11-21T22:00:00Z') / 1000; // 5 PM in New York
const meteo = { hourly: { time: [H5, H5 + 3600], precipitation_probability: [70, null] }, daily: { weather_code: [61] } };

const POINT = 'https://api.weather.gov/points/40.9252,-73.9643';
const nwsFetch = (overrides: Record<string, Response> = {}) => (url: string) => {
  if (url.startsWith('https://api.open-meteo.com')) return Promise.resolve(overrides.meteo ?? fail(503));
  if (url === POINT) return Promise.resolve(overrides.point ?? ok({ properties: { forecast: 'https://nws/daily', forecastHourly: 'https://nws/hourly' } }));
  if (url === 'https://nws/daily') return Promise.resolve(overrides.daily ?? ok({ properties: { periods: [{ shortForecast: 'Chance Rain Showers' }] } }));
  if (url === 'https://nws/hourly')
    return Promise.resolve(
      overrides.hourly ??
        ok({
          properties: {
            periods: [
              { startTime: '2026-11-21T17:00:00-05:00', probabilityOfPrecipitation: { value: 60 } },
              { startTime: '2026-11-21T18:00:00-05:00', probabilityOfPrecipitation: { value: null } },
              { startTime: 'garbage', probabilityOfPrecipitation: { value: 90 } },
              { probabilityOfPrecipitation: { value: 90 } },
            ],
          },
        }),
    );
  return Promise.reject(new Error(`unexpected ${url}`));
};

describe('skyOfCode (WMO codes)', () => {
  it.each([
    [0, 'clear'], [1, 'clear'], [2, 'partly'], [3, 'cloudy'], [45, 'fog'], [48, 'fog'], [51, 'drizzle'], [57, 'drizzle'],
    [61, 'rain'], [67, 'rain'], [80, 'rain'], [82, 'rain'], [71, 'snow'], [77, 'snow'], [85, 'snow'], [86, 'snow'],
    [95, 'storm'], [99, 'storm'],
  ])('%i → %s', (code, sky) => expect(skyOfCode(code)).toBe(sky));

  it('knows nothing of missing or unknown codes', () => {
    for (const code of [null, undefined, NaN, 4, 30, 90]) expect(skyOfCode(code)).toBeNull();
  });
});

describe('skyOfText (weather.gov words)', () => {
  it.each([
    ['Chance Showers And Thunderstorms', 'storm'], ['Rain And Snow', 'snow'], ['Light Sleet', 'snow'], ['Rain Showers Likely', 'rain'],
    ['Patchy Drizzle', 'drizzle'], ['Areas Of Fog', 'fog'], ['Partly Cloudy', 'partly'], ['Mostly Sunny', 'partly'], ['Mostly Cloudy', 'cloudy'],
    ['Overcast', 'cloudy'], ['Sunny', 'clear'], ['Clear', 'clear'],
  ])('%s → %s', (text, sky) => expect(skyOfText(text)).toBe(sky));

  it('knows nothing of missing or strange words', () => {
    for (const text of [null, undefined, '', 'Blowing Dust']) expect(skyOfText(text)).toBeNull();
  });
});

describe('openMeteo', () => {
  it('reads today’s sky and each hour’s chance of rain, a missing chance as none', async () => {
    fetchMock.mockResolvedValue(ok(meteo));
    expect(await openMeteo(40.92515, -73.96425)).toEqual({
      source: 'open-meteo',
      today: 'rain',
      hours: [{ time: '2026-11-21T22:00:00.000Z', rain: 70 }, { time: '2026-11-21T23:00:00.000Z', rain: 0 }],
    });
    expect(String(fetchMock.mock.calls[0][0])).toContain('latitude=40.92515');
  });

  it('copes with a missing daily code and missing chances', async () => {
    fetchMock.mockResolvedValue(ok({ hourly: { time: [H5] } }));
    expect(await openMeteo(1, 2)).toEqual({ source: 'open-meteo', today: null, hours: [{ time: '2026-11-21T22:00:00.000Z', rain: 0 }] });
  });

  it('fails on an error status or a body without hours', async () => {
    fetchMock.mockResolvedValue(fail(500));
    await expect(openMeteo(1, 2)).rejects.toThrow('api.open-meteo.com → 500');
    fetchMock.mockResolvedValue(ok({ error: true, reason: 'bad' }));
    await expect(openMeteo(1, 2)).rejects.toThrow('no hourly forecast');
  });
});

describe('nws', () => {
  it('finds the place’s forecasts, then reads the day and the hours, skipping hours without a time', async () => {
    fetchMock.mockImplementation(nwsFetch());
    expect(await nws(40.92515, -73.96425)).toEqual({
      source: 'nws',
      today: 'rain',
      hours: [{ time: '2026-11-21T22:00:00.000Z', rain: 60 }, { time: '2026-11-21T23:00:00.000Z', rain: 0 }],
    });
    expect(fetchMock.mock.calls[0][1].headers['User-Agent']).toMatch(/BusBuddy/);
  });

  it('fails for a place it doesn’t cover', async () => {
    fetchMock.mockImplementation(nwsFetch({ point: fail(404) }));
    await expect(nws(40.92515, -73.96425)).rejects.toThrow('api.weather.gov → 404');
    fetchMock.mockImplementation(nwsFetch({ point: ok({ properties: {} }) }));
    await expect(nws(40.92515, -73.96425)).rejects.toThrow('no forecast for this place');
  });

  it('copes with empty forecasts', async () => {
    fetchMock.mockImplementation(nwsFetch({ daily: ok({}), hourly: ok({}) }));
    expect(await nws(40.92515, -73.96425)).toEqual({ source: 'nws', today: null, hours: [] });
  });
});

describe('forecastAt', () => {
  it('uses Open-Meteo when it answers', async () => {
    fetchMock.mockResolvedValue(ok(meteo));
    expect((await forecastAt(40.92515, -73.96425)).source).toBe('open-meteo');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to the National Weather Service when Open-Meteo fails or can’t be reached', async () => {
    fetchMock.mockImplementation(nwsFetch());
    expect((await forecastAt(40.92515, -73.96425)).source).toBe('nws');
    fetchMock.mockImplementation((url: string) => (url.includes('open-meteo') ? Promise.reject(new Error('down')) : nwsFetch()(url)));
    expect((await forecastAt(40.92515, -73.96425)).source).toBe('nws');
  });

  it('fails when both do', async () => {
    fetchMock.mockImplementation(nwsFetch({ point: fail(500) }));
    await expect(forecastAt(40.92515, -73.96425)).rejects.toThrow('api.weather.gov → 500');
  });
});
