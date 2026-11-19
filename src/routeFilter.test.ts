import { chosenTrips, routeChoices, toggleRoute } from './routeFilter';
import type { Trip } from './types';

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
