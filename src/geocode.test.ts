import * as Location from 'expo-location';
import { geocode } from './geocode';

jest.mock('expo-location', () => ({ geocodeAsync: jest.fn() }));

const geocodeAsync = Location.geocodeAsync as jest.Mock;

describe('geocode (phone)', () => {
  it('returns the first match only', async () => {
    geocodeAsync.mockResolvedValue([
      { latitude: 40.9, longitude: -73.9, accuracy: 5 },
      { latitude: 1, longitude: 2 },
    ]);
    await expect(geocode('Tenafly')).resolves.toEqual({ latitude: 40.9, longitude: -73.9 });
    expect(geocodeAsync).toHaveBeenCalledWith('Tenafly');
  });

  it('is null with no match or when the geocoder fails', async () => {
    geocodeAsync.mockResolvedValue([]);
    await expect(geocode('nowhere')).resolves.toBeNull();
    geocodeAsync.mockRejectedValue(new Error('offline'));
    await expect(geocode('Tenafly')).resolves.toBeNull();
  });
});
