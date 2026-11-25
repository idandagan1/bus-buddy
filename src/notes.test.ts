// Ranking a route card's warnings, and folding all but the first past two.
import { foldedSummary, routeNotes, SHOWN, splitNotes, weatherNotes } from './notes';
import type { Detour } from './detours';
import type { Advisory, TrafficIncident } from './types';

const advisory = (id: string, heading: string, paragraphs: string[] = []): Advisory => ({ id, heading, severity: 'high', paragraphs, updated: null });
const detour = (near: Detour['near']): Detour => ({ advisory: advisory(`d-${near}`, 'Bus route 166 is on a detour in Tenafly.', ['Buses will use Engle St.']), town: 'Tenafly', near });
const incident = (id: string, kind: TrafficIncident['kind'], what: string | null = null): TrafficIncident => ({
  id, kind, what, road: null, from: 'Hurley Pl', to: null, delayMin: null, until: null, points: [],
});
const gas = { town: 'Tenafly', title: 'Gas work', link: 'https://t/gas', posted: '2026-11-19T20:08:00.000Z' };
const none = { detours: [], incidents: [], alerts: [], roadWork: [] };

describe('routeNotes', () => {
  it('ranks a detour by the rider’s stop, then closures, alerts, other detours, works, town notices', () => {
    const notes = routeNotes({
      detours: [detour(null), detour('town'), detour('street')],
      incidents: [incident('w', 'road-works'), incident('c', 'road-closed', 'Closed')],
      alerts: [advisory('pa', 'Port Authority Construction Advisory', ['Expect delays.'])],
      roadWork: [gas],
    });
    expect(notes.map((n) => n.key)).toEqual([
      'detour:d-street', 'detour:d-town', 'traffic:c', 'detour:d-null', 'alert:pa', 'traffic:w', 'roadwork:https://t/gas',
    ]);
  });

  it('says what each note is, with its explanation', () => {
    const [d, c, a, w, g] = routeNotes({ detours: [detour('street')], incidents: [incident('c', 'road-closed', 'Closed'), incident('w', 'road-works')], alerts: [advisory('pa', 'PA advisory', ['Expect delays.'])], roadWork: [gas] });
    expect(d).toMatchObject({ urgent: true, text: '↪️  Detour near your stop in Tenafly: buses may skip it', detail: 'Bus route 166 is on a detour in Tenafly. Buses will use Engle St.', label: 'detour' });
    expect(c).toMatchObject({ urgent: true, text: '⛔  Road closed near Hurley Pl', detail: "Closed · on your bus's way", label: 'road closed' });
    expect(a).toMatchObject({ urgent: true, text: '⚠️  PA advisory', detail: 'Expect delays.', label: 'service alert' });
    expect(w).toMatchObject({ urgent: false, detail: null, label: 'road works' });
    expect(g).toMatchObject({ urgent: false, detail: 'Posted Thu, Nov 19', label: 'road work', link: 'https://t/gas' });
  });

  it('gives a far detour and a bare alert no explanation', () => {
    const [d, a] = routeNotes({ ...none, detours: [detour(null)], alerts: [advisory('x', 'Heads up')] });
    expect(d.detail).toBeNull();
    expect(a.detail).toBeNull();
  });

  it('has nothing to say with nothing going on', () => {
    expect(routeNotes(none)).toEqual([]);
  });
});

describe('folding', () => {
  const notes = routeNotes({ ...none, incidents: [incident('a', 'road-closed'), incident('b', 'road-closed'), incident('c', 'accident')], roadWork: [gas] });

  it(`shows up to ${SHOWN} in full, and past that only the first`, () => {
    expect(splitNotes([])).toEqual({ shown: [], folded: [] });
    expect(splitNotes(notes.slice(0, 2))).toEqual({ shown: notes.slice(0, 2), folded: [] });
    expect(splitNotes(notes)).toEqual({ shown: notes.slice(0, 1), folded: notes.slice(1) });
  });

  it('counts the folded notes by kind, in rank order', () => {
    expect(foldedSummary(notes.slice(1))).toBe('road closed · accident · road work');
    expect(foldedSummary(notes)).toBe('road closed ×2 · accident · road work');
  });
});

describe('weatherNotes', () => {
  it('keeps the given order and names each warning by its event', () => {
    const notes = weatherNotes(
      [
        { id: 'a', event: 'Flood Warning', severity: 'Severe', what: 'Rivers rising.', until: null },
        { id: 'b', event: 'Wind Advisory', severity: 'Moderate', what: '', until: null },
      ],
      0,
    );
    expect(notes.map((n) => [n.text, n.detail, n.label, n.rank])).toEqual([
      ['⚠️\u00A0 Flood Warning', 'Rivers rising.', 'flood warning', 0],
      ['⚠️\u00A0 Wind Advisory', null, 'wind advisory', 1],
    ]);
  });
});
