// The weather on the home screen: today's sky as an icon, or an umbrella reminder when rain is likely during the
// next ride. Weather is a nicety, so failures stay quiet: nothing shows rather than an error.
import { useEffect, useState } from 'react';
import type { Forecast, Sky, Stop } from './types';

const TTL_MS = 30 * 60 * 1000;
// A chance of rain at least this high (percent) is worth carrying an umbrella for.
export const RAIN_LIKELY = 50;

export const SKY: Record<Sky, { icon: string; label: string }> = {
  clear: { icon: '☀️', label: 'Sunny' },
  partly: { icon: '⛅', label: 'Partly cloudy' },
  cloudy: { icon: '☁️', label: 'Cloudy' },
  fog: { icon: '🌫️', label: 'Foggy' },
  drizzle: { icon: '🌦️', label: 'Drizzle' },
  rain: { icon: '🌧️', label: 'Rain' },
  snow: { icon: '❄️', label: 'Snow' },
  storm: { icon: '⛈️', label: 'Thunderstorms' },
};

// Nearby stops share a forecast: a hundredth of a degree is about a kilometer.
const placeKey = (s: Pick<Stop, 'latitude' | 'longitude'>) => `${s.latitude.toFixed(2)},${s.longitude.toFixed(2)}`;
const cache = new Map<string, { at: number; forecast: Promise<Forecast | null> }>();

export function loadForecast(stop: Pick<Stop, 'latitude' | 'longitude'>): Promise<Forecast | null> {
  const key = placeKey(stop);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.forecast;
  const [lat, lon] = key.split(',');
  const forecast = fetch(`/api/weather?${new URLSearchParams({ lat, lon })}`)
    .then((res) => (res.ok ? (res.json() as Promise<Forecast>) : null))
    .catch(() => null);
  cache.set(key, { at: Date.now(), forecast });
  // A failure isn't kept, so the next look tries again.
  forecast.then((f) => f || cache.delete(key));
  return forecast;
}

export const clearForecasts = () => cache.clear();

// A stop's forecast, or null while loading, when unavailable, or for a stop without a usable place.
export function useWeather(stop: Pick<Stop, 'latitude' | 'longitude'> | null | undefined): Forecast | null {
  const usable = !!stop && Number.isFinite(stop.latitude) && Number.isFinite(stop.longitude) && !(stop.latitude === 0 && stop.longitude === 0);
  const key = usable ? placeKey(stop) : null;
  const [state, setState] = useState<{ key: string; forecast: Forecast | null } | null>(null);
  useEffect(() => {
    if (!key) return;
    let live = true;
    const [latitude, longitude] = key.split(',').map(Number);
    loadForecast({ latitude, longitude }).then((forecast) => live && setState({ key, forecast }));
    return () => {
      live = false;
    };
  }, [key]);
  return state && state.key === key ? state.forecast : null;
}

// The first hour of a ride (from the hour it leaves through when it arrives) when rain is likely at either end.
export function rainDuring(forecasts: (Forecast | null | undefined)[], departure: string, arrival: string): string | null {
  const start = Math.floor(Date.parse(departure) / 3600000) * 3600000;
  const end = Date.parse(arrival);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  const wet = forecasts
    .flatMap((f) => f?.hours ?? [])
    .filter((h) => h.rain >= RAIN_LIKELY && Date.parse(h.time) >= start && Date.parse(h.time) <= end)
    .map((h) => Date.parse(h.time));
  return wet.length ? new Date(Math.min(...wet)).toISOString() : null;
}

// "5 PM", New York time.
export const formatHour = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric' });
