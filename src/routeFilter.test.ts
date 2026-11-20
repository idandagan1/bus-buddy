import { chosenTrips, offerLabel, routeChoices, routeLabel, toggleRoute } from './routeFilter';
import type { Stop, Trip } from './types';

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

describe('offerLabel', () => {
  const stop = (extra: Partial<Stop>) => ({ id: 'x', name: 'x', town: '', state: '', latitude: 0, longitude: 0, ...extra }) as Stop;

  it('names NJ Transit’s lines when known, Coach USA by name', () => {
    expect(offerLabel({ from: stop({ carrier: 'NJT' }), to: stop({ carrier: 'NJT', routes: ['166'] }) })).toBe('+ 166 NJT');
    expect(offerLabel({ from: stop({ carrier: 'NJT' }), to: stop({ carrier: 'NJT' }) })).toBe('+ NJ Transit');
    expect(offerLabel({ from: stop({}), to: stop({}) })).toBe('+ Coach USA');
  });
});
