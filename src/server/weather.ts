// The forecast at a stop: today's sky for a small icon, and each hour's chance of rain for an umbrella reminder.
// Open-Meteo first (free, no key, one request); the US National Weather Service when it fails (also free, but
// three requests and words instead of codes).
import type { Forecast, Sky, WeatherAlert } from '@/types';

const UA = { 'User-Agent': 'BusBuddy/1.0 (bus-buddy web app)', Accept: 'application/geo+json' };

async function json(url: string, headers?: Record<string, string>) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${new URL(url).host} → ${res.status}`);
  return res.json();
}

// WMO weather codes, as Open-Meteo reports them.
export function skyOfCode(code: number | null | undefined): Sky | null {
  if (code == null || !Number.isFinite(code)) return null;
  if (code <= 1) return 'clear';
  if (code === 2) return 'partly';
  if (code === 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 57) return 'drizzle';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'storm';
  return null;
}

// The National Weather Service's words ("Chance Rain Showers", "Mostly Sunny"), strongest weather first.
export function skyOfText(text: string | null | undefined): Sky | null {
  const t = text?.toLowerCase() ?? '';
  if (/thunder|t-storm/.test(t)) return 'storm';
  if (/snow|sleet|flurr|ice|wintry/.test(t)) return 'snow';
  if (/rain|shower/.test(t)) return 'rain';
  if (/drizzle/.test(t)) return 'drizzle';
  if (/fog|haze|mist/.test(t)) return 'fog';
  if (/partly|mostly sunny|mostly clear/.test(t)) return 'partly';
  if (/cloudy|overcast/.test(t)) return 'cloudy';
  if (/sunny|clear|fair/.test(t)) return 'clear';
  return null;
}

type OpenMeteo = {
  hourly?: { time?: number[]; precipitation_probability?: (number | null)[] };
  daily?: { weather_code?: (number | null)[] };
};

export async function openMeteo(lat: number, lon: number): Promise<Forecast> {
  const qs = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    hourly: 'precipitation_probability',
    daily: 'weather_code',
    timezone: 'America/New_York',
    timeformat: 'unixtime',
    forecast_days: '2',
  });
  const body: OpenMeteo = await json(`https://api.open-meteo.com/v1/forecast?${qs}`);
  const times = body.hourly?.time;
  if (!Array.isArray(times)) throw new Error('open-meteo → no hourly forecast');
  const chances = body.hourly?.precipitation_probability ?? [];
  return {
    source: 'open-meteo',
    today: skyOfCode(body.daily?.weather_code?.[0]),
    hours: times.map((t, i) => ({ time: new Date(t * 1000).toISOString(), rain: chances[i] ?? 0 })),
  };
}

type NwsPeriod = { startTime?: string; shortForecast?: string; probabilityOfPrecipitation?: { value?: number | null } };

export async function nws(lat: number, lon: number): Promise<Forecast> {
  const point = await json(`https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`, UA);
  const { forecast, forecastHourly } = point?.properties ?? {};
  if (!forecast || !forecastHourly) throw new Error('weather.gov → no forecast for this place');
  const [daily, hourly] = await Promise.all([json(forecast, UA), json(forecastHourly, UA)]);
  const periods: NwsPeriod[] = hourly?.properties?.periods ?? [];
  return {
    source: 'nws',
    // The first period is today (or tonight, late in the day).
    today: skyOfText((daily?.properties?.periods as NwsPeriod[] | undefined)?.[0]?.shortForecast),
    hours: periods
      .filter((p) => p.startTime && !Number.isNaN(Date.parse(p.startTime)))
      .map((p) => ({ time: new Date(p.startTime!).toISOString(), rain: p.probabilityOfPrecipitation?.value ?? 0 })),
  };
}

type NwsAlert = {
  id?: string;
  event?: string;
  severity?: string;
  status?: string;
  headline?: string;
  description?: string;
  ends?: string | null;
  expires?: string | null;
};

const SERIOUS = new Set(['Moderate', 'Severe', 'Extreme']);

// "* WHAT...Heavy snow expected.\n* WHERE..." → "Heavy snow expected." Alerts without the usual layout give
// their headline instead.
export function alertGist(a: Pick<NwsAlert, 'description' | 'headline'>): string {
  const what = a.description?.match(/\*\s*WHAT\.\.\.([\s\S]*?)(?=\n\s*\n|\n\s*\*|$)/)?.[1];
  return (what ?? a.headline ?? '').replace(/\s+/g, ' ').trim();
}

// The warnings and advisories in force at a place (not the minor statements, tests or drafts).
export async function nwsAlerts(lat: number, lon: number): Promise<WeatherAlert[]> {
  const body = await json(`https://api.weather.gov/alerts/active?point=${lat.toFixed(4)},${lon.toFixed(4)}`, UA);
  const features: { properties?: NwsAlert }[] = body?.features ?? [];
  return features
    .map((f) => f.properties ?? {})
    .filter((p) => p.status === 'Actual' && p.event && p.severity && SERIOUS.has(p.severity))
    .map((p) => ({
      id: p.id ?? p.event!,
      event: p.event!,
      what: alertGist(p),
      until: p.ends || p.expires || null,
      severity: p.severity as WeatherAlert['severity'],
    }));
}

async function sky(lat: number, lon: number): Promise<Forecast> {
  try {
    return await openMeteo(lat, lon);
  } catch (first) {
    console.error('weather: open-meteo failed, trying weather.gov', first);
    return nws(lat, lon);
  }
}

// The forecast with the alerts in force; alerts that can't be loaded are left out rather than failing it.
export async function forecastAt(lat: number, lon: number): Promise<Forecast> {
  const [forecast, alerts] = await Promise.all([
    sky(lat, lon),
    nwsAlerts(lat, lon).catch((e) => {
      console.error('weather: alerts failed', e);
      return [];
    }),
  ]);
  return { ...forecast, alerts, checked: new Date().toISOString() };
}
