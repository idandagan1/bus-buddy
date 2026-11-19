import { mergeTrips } from './routeTrips';
import type { Trip } from './types';

const trip = (id: string, departure: string, arrival: string) => ({ id, departure: `2026-11-19T${departure}:00-05:00`, arrival: `2026-11-19T${arrival}:00-05:00` }) as Trip;

describe('mergeTrips', () => {
  const coach = [trip('coach 7:30', '19:30', '20:10'), trip('coach 8:00', '20:00', '20:40')];
  const njt = [trip('166 7:30', '19:30', '20:39'), trip('166X 7:45', '19:45', '20:21')];

  it('lists both carriers’ buses by departure, the faster of two leaving together first', () => {
    expect(mergeTrips(coach, njt)?.map((t) => t.id)).toEqual(['coach 7:30', '166 7:30', '166X 7:45', 'coach 8:00']);
  });

  it('shows whichever carrier has loaded while the other is still loading', () => {
    expect(mergeTrips(coach, null)).toBe(coach);
    expect(mergeTrips(null, njt)).toBe(njt);
    expect(mergeTrips(null, null)).toBeNull();
  });
});
