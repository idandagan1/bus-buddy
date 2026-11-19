import { isRideBack } from './direction';
import type { SavedRoute, Stop } from './types';

jest.mock('expo-location', () => ({}));

const stop = (name: string, latitude: number, longitude: number): Stop => ({ id: name, name, town: '', state: '', latitude, longitude });
const route: SavedRoute = { id: '1', from: stop('Tenafly', 40.925, -73.964), to: stop('Port Authority', 40.757, -73.99) };
const at = (h: number, m = 0) => new Date(2026, 10, 18, h, m);

describe('isRideBack', () => {
  it('goes by location when there is one, whatever the time', () => {
    expect(isRideBack(route, { latitude: 40.75, longitude: -73.99 }, at(8))).toBe(true);
    expect(isRideBack(route, { latitude: 40.92, longitude: -73.96 }, at(18))).toBe(false);
  });

  it('without a location, heads into the city in the morning and out of it from noon', () => {
    expect(isRideBack(route, null, at(6))).toBe(false);
    expect(isRideBack(route, null, at(11, 59))).toBe(false);
    expect(isRideBack(route, null, at(12))).toBe(true);
    expect(isRideBack(route, null, at(18, 30))).toBe(true);
    expect(isRideBack(route, null, at(23, 59))).toBe(true);
  });

  it('works for a route saved the other way round (Port Authority → Tenafly)', () => {
    const home = { ...route, from: route.to, to: route.from };
    expect(isRideBack(home, null, at(7))).toBe(true);
    expect(isRideBack(home, null, at(19, 30))).toBe(false);
  });
});
