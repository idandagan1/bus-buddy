// The weather on the home screen: rain during a ride, the hour it's named by, and loading forecasts quietly.
import { act, renderHook } from '@testing-library/react-native';
import type { Forecast } from './types';
import { clearForecasts, formatHour, loadForecast, rainDuring, useWeather } from './weather';

const hour = (h: number, rain: number) => ({ time: new Date(Date.UTC(2026, 10, 21, h)).toISOString(), rain });
// 5 PM to 8 PM in New York.
const tenafly: Forecast = { source: 'open-meteo', today: 'rain', hours: [hour(22, 20), hour(23, 55), hour(0, 80), hour(1, 90)] };
const nyc: Forecast = { source: 'nws', today: 'cloudy', hours: [hour(22, 60), hour(23, 10)] };
const at = (h: number, m = 0) => new Date(Date.UTC(2026, 10, 21, h, m)).toISOString();

describe('rainDuring', () => {
  it('names the first likely-rain hour at either end of the ride', () => {
    expect(rainDuring([tenafly], at(22, 40), at(23, 30))).toBe(at(23));
    expect(rainDuring([tenafly, nyc], at(22, 40), at(23, 30))).toBe(at(22));
  });

  it('counts the hour the bus leaves in, but not hours after it arrives', () => {
    expect(rainDuring([nyc], at(22, 59), at(23, 30))).toBe(at(22));
    expect(rainDuring([tenafly], at(22, 0), at(22, 59))).toBeNull();
  });

  it('says nothing below the line, at exactly the line it warns', () => {
    expect(rainDuring([{ ...nyc, hours: [hour(22, 49)] }], at(22), at(23))).toBeNull();
    expect(rainDuring([{ ...nyc, hours: [hour(22, 50)] }], at(22), at(23))).toBe(at(22));
  });

  it('copes with missing forecasts and bad times', () => {
    expect(rainDuring([null, undefined], at(22), at(23))).toBeNull();
    expect(rainDuring([], at(22), at(23))).toBeNull();
    expect(rainDuring([tenafly], 'soon', at(23))).toBeNull();
    expect(rainDuring([tenafly], at(22), '')).toBeNull();
  });
});

it('formats an hour the New York way', () => {
  expect(formatHour(at(22))).toBe('5 PM');
  expect(formatHour(at(14))).toBe('9 AM');
});

describe('loading forecasts', () => {
  const fetchMock = jest.fn();
  const ok = (body: unknown) => ({ ok: true, json: async () => body }) as Response;

  beforeEach(() => {
    clearForecasts();
    fetchMock.mockReset().mockResolvedValue(ok(tenafly));
    globalThis.fetch = fetchMock;
  });

  it('asks once per place, rounding nearby stops together', async () => {
    expect(await loadForecast({ latitude: 40.92515, longitude: -73.96425 })).toEqual(tenafly);
    await loadForecast({ latitude: 40.9271, longitude: -73.9601 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/weather?lat=40.93&lon=-73.96');
  });

  it('asks again after half an hour', async () => {
    jest.useFakeTimers({ now: Date.parse(at(20)) });
    await loadForecast({ latitude: 40.9, longitude: -73.9 });
    jest.setSystemTime(Date.parse(at(20, 31)));
    await loadForecast({ latitude: 40.9, longitude: -73.9 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });

  it('gives nothing on a failure, and tries again next time', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({}) } as Response).mockRejectedValueOnce(new Error('offline'));
    expect(await loadForecast({ latitude: 40.9, longitude: -73.9 })).toBeNull();
    expect(await loadForecast({ latitude: 40.9, longitude: -73.9 })).toBeNull();
    expect(await loadForecast({ latitude: 40.9, longitude: -73.9 })).toEqual(tenafly);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('useWeather gives the stop’s forecast, and nothing for a stop without a place', async () => {
    const { result, rerender } = await renderHook((stop: { latitude: number; longitude: number } | null) => useWeather(stop), {
      initialProps: { latitude: 40.9, longitude: -73.9 },
    });
    await act(async () => {});
    expect(result.current).toEqual(tenafly);
    for (const stop of [null, { latitude: NaN, longitude: -73.9 }, { latitude: 0, longitude: 0 }]) {
      await rerender(stop);
      expect(result.current).toBeNull();
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
