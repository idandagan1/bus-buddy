import { chosenTrips, linesOf, offerLabel, pickLines, routeChoices, routeLabel, toggleRoute } from './routeFilter';
import type { Leg, SavedRoute, Stop, Trip } from './types';

const trip = (route: string, departure: string) => ({ id: `${route}-${departure}`, route, departure }) as Trip;
const trips = [trip('166', '19:10'), trip('166T', '19:15'), trip('166X', '19:15'), trip('166', '19:30'), trip('166X', '19:30')];

describe('routeChoices', () => {
  it('lists the routes the trips run under, in number order', () => {
    expect(routeChoices(trips, undefined)).toEqual(['166', '166T', '166X']);
  });

  it('offers nothing to choose when only one route runs', () => {
    expect(routeChoices([trip('166', '19:10')], undefined)).toEqual([]);
    expect(routeChoices(null, undefined)).toEqual([]);
  });

  it('keeps a chosen route that has no trips right now, so it can be unchosen', () => {
    expect(routeChoices([trip('166', '19:10')], ['166X'])).toEqual(['166', '166X']);
  });
});

describe('chosenTrips', () => {
  it('shows every trip when nothing is chosen', () => {
    expect(chosenTrips(trips, {})).toBe(trips);
  });

  it('shows only the chosen routes', () => {
    expect(chosenTrips(trips, { only: ['166X'] })?.map((t) => t.id)).toEqual(['166X-19:15', '166X-19:30']);
    expect(chosenTrips(trips, { only: ['166X', '166T'] })).toHaveLength(3);
  });

  it('stays null while trips load', () => {
    expect(chosenTrips(null, { only: ['166X'] })).toBeNull();
  });
});

describe('toggleRoute', () => {
  const choices = ['166', '166T', '166X'];

  it('chooses and unchooses routes', () => {
    expect(toggleRoute(undefined, '166X', choices)).toEqual(['166X']);
    expect(toggleRoute(['166X'], '166T', choices)).toEqual(['166T', '166X']);
    expect(toggleRoute(['166T', '166X'], '166X', choices)).toEqual(['166T']);
  });

  it('goes back to all when the last route is unchosen, every route is chosen, or All is tapped', () => {
    expect(toggleRoute(['166X'], '166X', choices)).toBeUndefined();
    expect(toggleRoute(['166T', '166X'], '166', choices)).toBeUndefined();
    expect(toggleRoute(['166X'], null, choices)).toBeUndefined();
  });
});

describe('routeLabel', () => {
  const routes = ['20', '166', '166T', '166X'];

  it('spells out NJ Transit’s express and local buses', () => {
    expect(routeLabel('166X', 'NJT', routes)).toEqual({ label: '166X Express', kind: 'express' });
    expect(routeLabel('166T', 'NJT', routes)).toEqual({ label: '166T Turnpike', kind: 'turnpike' });
    expect(routeLabel('166', 'NJT', routes)).toEqual({ label: '166 Local', kind: 'local' });
  });

  it('only calls a bus local when an express of it is showing', () => {
    expect(routeLabel('166', 'NJT', ['166'])).toEqual({ label: '166', kind: 'plain' });
    expect(routeLabel('16', 'NJT', ['16', '166X'])).toEqual({ label: '16', kind: 'plain' });
  });

  it('marks Coach USA routes as Coach', () => {
    expect(routeLabel('20', 'RCK', routes)).toEqual({ label: 'Coach 20', kind: 'coach' });
  });
});

describe('pickLines', () => {
  const stop = (id: string, extra: Partial<Stop> = {}) => ({ id, name: id, town: '', state: '', latitude: 0, longitude: 0, ...extra }) as Stop;
  const also: Leg = { from: stop('njt:a', { carrier: 'NJT' }), to: stop('njt:b', { carrier: 'NJT', routes: ['166'] }) };
  const route: SavedRoute = { id: 'r', from: stop('c-a'), to: stop('c-b'), also };
  const own = ['20'];
  const extra = ['166', '166T', '166X'];

  it('keeps the other carrier while any of its lines is chosen', () => {
    expect(pickLines(route, ['166X'], own, extra)).toEqual({ ...route, only: ['166X'] });
    expect(pickLines(route, ['20', '166T'], own, extra)).toEqual({ ...route, only: ['20', '166T'] });
    expect(pickLines(route, undefined, own, extra)).toEqual({ ...route, only: undefined });
  });

  it('takes the other carrier off when none of its lines is chosen', () => {
    expect(pickLines(route, ['20'], own, extra)).toEqual({ ...route, also: undefined, only: undefined });
    expect(pickLines({ ...route, from: stop('njt:x') }, ['166X'], extra, ['20'])).toMatchObject({ also: undefined, only: ['166X'] });
  });

  it('just saves the choice on a route without the other carrier', () => {
    const plain = { ...route, also: undefined };
    expect(pickLines(plain, ['166X'], extra, [])).toEqual({ ...plain, only: ['166X'] });
  });
});

describe('offerLabel', () => {
  const stop = (extra: Partial<Stop>) => ({ id: 'x', name: 'x', town: '', state: '', latitude: 0, longitude: 0, ...extra }) as Stop;

  it('names NJ Transit’s lines when known, Coach USA by name', () => {
    expect(offerLabel({ from: stop({ carrier: 'NJT' }), to: stop({ carrier: 'NJT', routes: ['166'] }) })).toBe('+ 166 NJT');
    expect(offerLabel({ from: stop({ carrier: 'NJT' }), to: stop({ carrier: 'NJT' }) })).toBe('+ NJ Transit');
    expect(offerLabel({ from: stop({}), to: stop({}) })).toBe('+ Coach USA');
  });
});

describe('linesOf', () => {
  it('lists each line once', () => {
    expect(linesOf(trips)).toEqual(['166', '166T', '166X']);
    expect(linesOf(null)).toEqual([]);
  });
});
