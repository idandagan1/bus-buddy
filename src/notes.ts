// Everything a route card may warn about, as one ranked list: the most pressing shows in full and, past two, the
// rest fold into a single line ("3 more: road closed ×2 · road work") so the next bus stays in view.
import { formatDay } from './api';
import { detourLine, type Detour } from './detours';
import { incidentLabel, incidentLine, isUrgent } from './traffic';
import type { RoadWork } from './townFeeds';
import { formatUntil } from './weather';
import type { Advisory, TrafficIncident, WeatherAlert } from './types';

// urgent: shown in the warning color. label: how the note is counted in the folded line. link: the full notice,
// offered once the note is opened.
export type Note = { key: string; rank: number; urgent: boolean; text: string; detail: string | null; label: string; link?: string };

// More notes than this, and all but the first fold away.
export const SHOWN = 2;

export function routeNotes(parts: { detours: Detour[]; incidents: TrafficIncident[]; alerts: Advisory[]; roadWork: RoadWork[] }): Note[] {
  const notes: Note[] = [
    ...parts.detours.map((d) => ({
      key: `detour:${d.advisory.id}`,
      // A detour by the rider's own stop matters most; one elsewhere on the line, less than a closure on the way.
      rank: d.near === 'street' ? 0 : d.near === 'town' ? 1 : 3,
      urgent: true,
      text: `↪️  ${detourLine(d)}`,
      detail: d.near ? [d.advisory.heading, ...d.advisory.paragraphs].join(' ') : null,
      label: 'detour',
    })),
    ...parts.incidents.map((i) => ({
      key: `traffic:${i.id}`,
      rank: isUrgent(i) ? 2 : 5,
      urgent: isUrgent(i),
      text: incidentLine(i),
      detail: i.what ? `${i.what} · on your bus's way` : null,
      label: incidentLabel(i),
    })),
    ...parts.alerts.map((a) => ({
      key: `alert:${a.id}`,
      rank: 4,
      urgent: true,
      text: `⚠️  ${a.heading}`,
      detail: a.paragraphs[0] ?? null,
      label: 'service alert',
    })),
    ...parts.roadWork.map((n) => ({
      key: `roadwork:${n.link}`,
      rank: 6,
      urgent: false,
      text: `🚧  Road work in ${n.town}: ${n.title}`,
      detail: `Posted ${formatDay(n.posted)}`,
      label: 'road work',
      link: n.link,
    })),
  ];
  return notes.sort((a, b) => a.rank - b.rank);
}

// Weather warnings, most serious first (alertsFor's order), folded like a card's warnings: "2 more: wind advisory".
export function weatherNotes(alerts: WeatherAlert[], now: number): Note[] {
  return alerts.map((a, i) => {
    const until = formatUntil(a.until, now);
    return {
      key: `weather:${a.id}`,
      rank: i,
      urgent: true,
      text: `⚠️\u00A0 ${a.event}${until ? ` ${until}` : ''}`,
      detail: a.what || null,
      label: a.event.toLowerCase(),
    };
  });
}

// "road closed ×2 · road work · service alert": each kind once, in the order they rank.
export function foldedSummary(notes: Note[]): string {
  const counts = new Map<string, number>();
  for (const n of notes) counts.set(n.label, (counts.get(n.label) ?? 0) + 1);
  return [...counts].map(([label, n]) => (n > 1 ? `${label} ×${n}` : label)).join(' · ');
}

// The notes shown in full and the ones folded away.
export function splitNotes(notes: Note[]): { shown: Note[]; folded: Note[] } {
  return notes.length <= SHOWN ? { shown: notes, folded: [] } : { shown: notes.slice(0, 1), folded: notes.slice(1) };
}
