// Detours, read from an alert's words. NJ Transit's alerts name the street and town ("Bus route 166 is on a
// detour on E Clinton between Westervelt Ave and Engle Street in Tenafly") but not the stops, so a rider's stop
// is flagged by its town and street: close enough to say "check before you wait", not to promise a skip.
import type { Advisory, Stop } from './types';

export const isDetour = (a: Advisory) => /detour/i.test(`${a.heading} ${a.paragraphs.join(' ')}`);

const text = (a: Advisory) => `${a.heading} ${a.paragraphs.join(' ')}`;

// "in Tenafly due to…" / "in Fort Lee." → the town.
export function detourTown(a: Advisory): string | null {
  return text(a).match(/\bin ((?:[A-Z][a-z]+)(?: [A-Z][a-z]+)*)\b/)?.[1] ?? null;
}

// The street the detour leaves ("on E Clinton between …" → "clinton"), without its direction or kind, so it
// matches "Dean Dr at East Clinton Ave".
export function detourStreet(a: Advisory): string | null {
  const street = text(a).match(/\bon ((?:[A-Z0-9][\w.]*)(?: [A-Z0-9][\w.]*)*) (?:between|from|at)\b/)?.[1];
  if (!street) return null;
  const words = street
    .toLowerCase()
    .replace(/\./g, '')
    .split(' ')
    .filter((w) => !/^(n|s|e|w|north|south|east|west|ave|avenue|st|street|rd|road|dr|drive|blvd|pl|ln)$/.test(w));
  return words.join(' ') || null;
}

const sameWord = (name: string, street: string) => new RegExp(`\\b${street.replace(/[^\w ]/g, '')}\\b`, 'i').test(name);

export type Detour = { advisory: Advisory; town: string | null; near: 'street' | 'town' | null };

// The detours among a route's alerts, nearest the rider's stops first: on their stop's street, then in its town.
export function detoursNear(advisories: Advisory[], stops: Stop[]): Detour[] {
  return advisories
    .filter(isDetour)
    .map((advisory) => {
      const town = detourTown(advisory);
      const street = detourStreet(advisory);
      const inTown = !!town && stops.some((s) => s.town?.toLowerCase() === town.toLowerCase());
      const onStreet = inTown && !!street && stops.some((s) => sameWord(s.name, street));
      return { advisory, town, near: onStreet ? ('street' as const) : inTown ? ('town' as const) : null };
    })
    .sort((a, b) => rank(a.near) - rank(b.near));
}

const rank = (near: Detour['near']) => (near === 'street' ? 0 : near === 'town' ? 1 : 2);

// The one-line summary shown on a route card.
export function detourLine(d: Detour): string {
  if (d.near === 'street') return `Detour near your stop in ${d.town}: buses may skip it`;
  if (d.near === 'town') return `Detour in ${d.town}: check your stop`;
  return d.advisory.heading;
}

// Every stop on a saved route, both carriers, either way round.
export const routeStops = (r: { from: Stop; to: Stop; also?: { from: Stop; to: Stop } }) => [r.from, r.to, ...(r.also ? [r.also.from, r.also.to] : [])];
