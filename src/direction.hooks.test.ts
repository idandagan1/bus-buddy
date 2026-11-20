import { act, renderHook } from '@testing-library/react-native';
import * as Location from 'expo-location';
import { AppState } from 'react-native';
import { useDirection } from './direction';
import type { SavedRoute, Stop } from './types';

jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  getForegroundPermissionsAsync: jest.fn(),
  getLastKnownPositionAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
}));
// Focus runs once on mount, like a screen coming into view.
jest.mock('expo-router', () => ({ useFocusEffect: (cb: () => void) => jest.requireActual('react').useEffect(cb, [cb]) }));

const loc = Location as jest.Mocked<typeof Location>;
const stop = (name: string, latitude: number, longitude: number): Stop => ({ id: name, name, town: '', state: '', latitude, longitude });
const tenafly = stop('Tenafly', 40.925, -73.964);
const portAuthority = stop('Port Authority', 40.757, -73.99);
const route: SavedRoute = { id: '1', from: tenafly, to: portAuthority };
const fix = (s: Stop) => ({ coords: { latitude: s.latitude, longitude: s.longitude } }) as Location.LocationObject;
const flush = () => act(() => jest.advanceTimersByTimeAsync(0));

let appStateListener: ((state: string) => void) | undefined;
const removeListener = jest.fn();

beforeEach(() => {
  // 8 AM: with no location, heads into the city.
  jest.useFakeTimers({ now: new Date(2026, 10, 19, 8) });
  jest.clearAllMocks();
  loc.getForegroundPermissionsAsync.mockResolvedValue({ granted: true } as Location.LocationPermissionResponse);
  loc.getLastKnownPositionAsync.mockResolvedValue(null);
  loc.getCurrentPositionAsync.mockResolvedValue(fix(tenafly));
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    appStateListener = listener as (state: string) => void;
    return { remove: removeListener } as unknown as ReturnType<typeof AppState.addEventListener>;
  });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useDirection', () => {
  it('starts out as saved', async () => {
    loc.getForegroundPermissionsAsync.mockReturnValue(new Promise(() => {}));
    const { result } = await renderHook(() => useDirection(route));
    expect(result.current).toEqual({ from: tenafly, to: portAuthority, reversed: false });
  });

  it('offers the ride back at the destination', async () => {
    loc.getLastKnownPositionAsync.mockResolvedValue(fix(portAuthority));
    const { result } = await renderHook(() => useDirection(route));
    await flush();
    expect(result.current).toEqual({ from: portAuthority, to: tenafly, reversed: true });
    expect(loc.getCurrentPositionAsync).not.toHaveBeenCalled();
  });

  it('asks for a fresh fix when there is no recent one', async () => {
    jest.setSystemTime(new Date(2026, 10, 19, 18));
    const { result } = await renderHook(() => useDirection(route));
    await flush();
    expect(loc.getLastKnownPositionAsync).toHaveBeenCalledWith({ maxAge: 10 * 60 * 1000 });
    expect(loc.getCurrentPositionAsync).toHaveBeenCalled();
    // In the evening, but standing at home: going in.
    expect(result.current.reversed).toBe(false);
  });

  it('goes by the time of day without permission, and never asks for it', async () => {
    loc.getForegroundPermissionsAsync.mockResolvedValue({ granted: false } as Location.LocationPermissionResponse);
    jest.setSystemTime(new Date(2026, 10, 19, 18));
    const { result } = await renderHook(() => useDirection(route));
    await flush();
    expect(result.current.reversed).toBe(true);
    expect(loc.getLastKnownPositionAsync).not.toHaveBeenCalled();
    expect(loc.getCurrentPositionAsync).not.toHaveBeenCalled();
  });

  it('goes by the time of day when the location lookup throws', async () => {
    loc.getLastKnownPositionAsync.mockRejectedValue(new Error('Location services are disabled'));
    jest.setSystemTime(new Date(2026, 10, 19, 18));
    const { result } = await renderHook(() => useDirection(route));
    await flush();
    expect(result.current.reversed).toBe(true);
  });

  it('goes by the time of day when the permission check throws', async () => {
    loc.getForegroundPermissionsAsync.mockRejectedValue(new Error('boom'));
    const { result } = await renderHook(() => useDirection(route));
    await flush();
    expect(result.current.reversed).toBe(false);
  });

  it('checks again when the app comes back to the foreground', async () => {
    const { result, unmount } = await renderHook(() => useDirection(route));
    await flush();
    expect(result.current.reversed).toBe(false);
    loc.getLastKnownPositionAsync.mockResolvedValue(fix(portAuthority));
    await act(async () => appStateListener?.('background'));
    await flush();
    expect(result.current.reversed).toBe(false);
    await act(async () => appStateListener?.('active'));
    await flush();
    expect(result.current.reversed).toBe(true);
    await unmount();
    expect(removeListener).toHaveBeenCalled();
  });
});
