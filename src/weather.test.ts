// The weather on the home screen: rain during a ride, the hour it's named by, and loading forecasts quietly.
import { act, renderHook } from '@testing-library/react-native';
import type { Forecast } from './types';
import { alertsFor, clearForecasts, formatHour, formatUntil, loadForecast, rainDuring, useWeather } from './weather';

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
    expect(fetchMock.mock.calls[0][0]).toBe('/api/weather?lat=40.93&lon=-73.96&v=2');
  });

  it('asks again after a quarter of an hour', async () => {
    jest.useFakeTimers({ now: Date.parse(at(20)) });
    await loadForecast({ latitude: 40.9, longitude: -73.9 });
    jest.setSystemTime(Date.parse(at(20, 16)));
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

describe('weather alerts', () => {
  const alert = (event: string, severity: 'Moderate' | 'Severe' | 'Extreme', id = event) => ({ id, event, severity, what: '', until: null });

  it('lists each event once, the most serious first', () => {
    const tenaflyAlerts = { ...tenafly, alerts: [alert('Wind Advisory', 'Moderate'), alert('Winter Storm Warning', 'Severe', 'a')] };
    const nycAlerts = { ...nyc, alerts: [alert('Winter Storm Warning', 'Severe', 'b'), alert('Flash Flood Warning', 'Extreme')] };
    expect(alertsFor([tenaflyAlerts, nycAlerts]).map((a) => a.id)).toEqual(['Flash Flood Warning', 'a', 'Wind Advisory']);
  });

  it('has none without forecasts or alerts', () => {
    expect(alertsFor([null, undefined, tenafly])).toEqual([]);
  });

  it('says until when, by the New York clock', () => {
    const now = Date.parse(at(17)); // noon Saturday
    expect(formatUntil(at(23), now)).toBe('until 6 PM');
    expect(formatUntil(at(23, 30), now)).toBe('until 6:30 PM');
    expect(formatUntil(new Date(Date.UTC(2026, 10, 23, 12)).toISOString(), now)).toBe('until Mon 7 AM');
    // 11 PM Saturday in New York is already Sunday in UTC.
    expect(formatUntil(new Date(Date.UTC(2026, 10, 22, 4)).toISOString(), now)).toBe('until 11 PM');
  });

  it('says nothing for an unknown end', () => {
    expect(formatUntil(null, 0)).toBe('');
    expect(formatUntil('soon', 0)).toBe('');
  });
});
