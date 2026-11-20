import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Platform } from 'react-native';
import MapScreen from '@/app/map';
import { formatTime, saveRoutes } from '@/api';
import { geocode } from '@/geocode';
import { useTripStatuses } from '@/live';
import { useRouteTrips } from '@/routeTrips';
import type { SavedRoute, Stop, Trip, TripStatus } from '@/types';
import { wakeBefore } from '@/wake';

jest.mock('react-native-reanimated', () => jest.requireActual('./reanimatedMock'));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 20, bottom: 10, left: 0, right: 0 }) }));
const mockParams: { route: string; reversed?: string; trip: string } = { route: 'r1', trip: 't1' };
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
}));
jest.mock('@/routeTrips', () => ({ useRouteTrips: jest.fn() }));
jest.mock('@/live', () => ({ ...jest.requireActual('@/live'), useTripStatuses: jest.fn() }));
jest.mock('@/geocode', () => ({ geocode: jest.fn() }));
jest.mock('@/wake', () => ({ wakeBefore: jest.fn() }));
// Apple Maps as a plain view carrying its props, with the camera call the screen makes through its ref.
const mockSetCamera = jest.fn();
jest.mock('expo-maps', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  const MapView = React.forwardRef((props: object, ref: unknown) => {
    React.useImperativeHandle(ref, () => ({ setCameraPosition: mockSetCamera }));
    return React.createElement(View, { testID: 'apple-map', ...props });
  });
  MapView.displayName = 'AppleMapsView';
  return { AppleMaps: { View: MapView } };
});

// Thursday Nov 19 2026, 10:00 AM in New York.
const NOW = Date.parse('2026-11-19T15:00:00Z');
const at = (h: number, m = 0) => new Date(Date.UTC(2026, 10, 19, h + 5, m)).toISOString();

const stop = (id: string, name: string): Stop => ({ id, name, town: 'Town', state: 'NJ', latitude: 40.8, longitude: -74 });
const route: SavedRoute = { id: 'r1', from: stop('a', 'Port Authority'), to: stop('b', 'Tenafly') };

const trip = (departure: string, id = 't1'): Trip => {
  const dep = Date.parse(departure);
  const arrival = new Date(dep + 60 * 60000).toISOString();
  return {
    id,
    journeyId: `j-${id}`,
    serviceDate: '2026-11-19',
    route: '166',
    carrier: 'NJ Transit',
    carrierCode: 'NJT',
    fromZone: null,
    toZone: null,
    headsign: 'Tenafly',
    gate: null,
    departure,
    arrival,
    approximate: false,
    stops: [
      { name: 'Port Authority Bus Terminal', time: departure, latitude: 40.757, longitude: -73.99 },
      { name: 'Englewood Cliffs', time: new Date(dep + 30 * 60000).toISOString(), latitude: 40.885, longitude: -73.952 },
      { name: 'Tenafly Ave & Main St', time: arrival, latitude: 40.925, longitude: -73.963 },
    ],
  };
};

const setTrips = (trips: Trip[] | null) =>
  jest.mocked(useRouteTrips).mockReturnValue({ trips, error: null, offline: false, cachedAt: null, reload: jest.fn(), legs: [trips, null] } as unknown as ReturnType<typeof useRouteTrips>);

type Marker = { id: string; title: string; systemImage: string };
const map = () => screen.getByTestId('apple-map');
const markers = () => map().props.markers as Marker[];
const searchBox = () => screen.getByPlaceholderText('Where are you going? (address or place)');

async function open() {
  await saveRoutes([route]);
  await render(<MapScreen />);
  await screen.findByText('‹ Back');
}

beforeEach(async () => {
  jest.useFakeTimers({ now: NOW });
  jest.clearAllMocks();
  mockParams.route = 'r1';
  mockParams.trip = 't1';
  delete mockParams.reversed;
  await AsyncStorage.clear();
  jest.mocked(useTripStatuses).mockReturnValue({});
  jest.mocked(router.canGoBack).mockReturnValue(true);
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('Map screen', () => {
  it('says the map isn’t on Android', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    await render(<MapScreen />);
    expect(screen.getByText('The map is available on iPhone and the website.')).toBeOnTheScreen();
  });

  it('spins while the route loads, and while the trip isn’t in the schedule', async () => {
    setTrips([trip(at(10, 30), 'other')]);
    mockParams.route = 'missing';
    await render(<MapScreen />);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(10);
    });
    expect(screen.queryByText('‹ Back')).toBeNull();
    screen.unmount();

    mockParams.route = 'r1';
    await saveRoutes([route]);
    await render(<MapScreen />);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(10);
    });
    expect(useRouteTrips).toHaveBeenLastCalledWith(route, false);
    expect(screen.queryByText('‹ Back')).toBeNull();
  });

  it('looks up the return trip when reversed', async () => {
    mockParams.reversed = '1';
    setTrips([trip(at(10, 30))]);
    await open();
    expect(useRouteTrips).toHaveBeenLastCalledWith(route, true);
  });

  it('starts on the last stop, with every stop on the map and a wake-up alarm', async () => {
    const t = trip(at(10, 30));
    setTrips([t]);
    await open();

    expect(screen.getByText('Get off at')).toBeOnTheScreen();
    expect(screen.getByText('Tenafly Ave & Main St')).toBeOnTheScreen();
    expect(screen.getByText(`Bus due ${formatTime(t.arrival)}`)).toBeOnTheScreen();
    expect(screen.getByText('Search a place, or tap a stop on the map.')).toBeOnTheScreen();

    expect(markers().map((m) => [m.id, m.systemImage])).toEqual([
      ['stop-0', 'figure.wave'],
      ['stop-1', 'bus'],
      ['stop-2', 'bell.fill'],
    ]);
    expect(markers()[1].title).toBe(`Englewood Cliffs · ${formatTime(t.stops[1].time)}`);
    expect(map().props.polylines[0].coordinates).toBe(t.stops);
    // Framed around all the stops.
    expect(map().props.cameraPosition.coordinates.longitude).toBeCloseTo((-73.99 + -73.952) / 2);
    expect(map().props.cameraPosition.zoom).toBeLessThanOrEqual(16);

    await fireEvent.press(screen.getByText('⏰ Wake me before this stop'));
    expect(wakeBefore).toHaveBeenCalledWith(t, null, 2);
  });

  it('picks a stop tapped on the map, and ignores other markers', async () => {
    const t = trip(at(10, 30));
    setTrips([t]);
    await open();

    await fireEvent(map(), 'markerClick', { id: 'stop-1' });
    expect(screen.getByText('Englewood Cliffs')).toBeOnTheScreen();
    expect(screen.getByText(`Bus due ${formatTime(t.stops[1].time)}`)).toBeOnTheScreen();
    expect(markers()[1].systemImage).toBe('bell.fill');

    await fireEvent(map(), 'markerClick', { id: 'bus' });
    await fireEvent(map(), 'markerClick', {});
    expect(screen.getByText('Englewood Cliffs')).toBeOnTheScreen();

    // No alarm for the stop you board at.
    await fireEvent(map(), 'markerClick', { id: 'stop-0' });
    expect(screen.getByText('Port Authority Bus Terminal')).toBeOnTheScreen();
    expect(screen.queryByText('⏰ Wake me before this stop')).toBeNull();
  });

  it('finds the stop closest to a searched place and frames both', async () => {
    const t = trip(at(10, 30));
    setTrips([t]);
    const place = { latitude: 40.886, longitude: -73.952 };
    jest.mocked(geocode).mockResolvedValue(place);
    await open();

    await fireEvent.changeText(searchBox(), '  Englewood Hospital ');
    await fireEvent(searchBox(), 'submitEditing');
    expect(geocode).toHaveBeenCalledWith('Englewood Hospital');
    expect(screen.queryByText('Looking it up…')).toBeNull();
    expect(screen.getByText('Closest stop')).toBeOnTheScreen();
    expect(screen.getByText('Englewood Cliffs')).toBeOnTheScreen();
    expect(screen.getByText(`Bus due ${formatTime(t.stops[1].time)} · ≈ 2 min walk to Englewood Hospital`)).toBeOnTheScreen();
    expect(screen.queryByText('Search a place, or tap a stop on the map.')).toBeNull();
    expect(markers().find((m) => m.id === 'place')).toMatchObject({ title: 'Englewood Hospital', systemImage: 'mappin' });
    expect(mockSetCamera).toHaveBeenCalledTimes(1);
    expect(mockSetCamera.mock.calls[0][0].coordinates.longitude).toBeCloseTo(-73.952);
  });

  it('says when a place can’t be found, and skips an empty search', async () => {
    setTrips([trip(at(10, 30))]);
    jest.mocked(geocode).mockResolvedValue(null);
    await open();

    await fireEvent(searchBox(), 'submitEditing');
    expect(geocode).not.toHaveBeenCalled();

    await fireEvent.changeText(searchBox(), 'Nowhere');
    await fireEvent(searchBox(), 'submitEditing');
    expect(await screen.findByText('Couldn’t find that place. Try adding the town, e.g. “Main St, Tenafly NJ”.')).toBeOnTheScreen();
    expect(screen.getByText('Get off at')).toBeOnTheScreen();
    expect(mockSetCamera).not.toHaveBeenCalled();
  });

  it('shows the live bus and drops the alarm once the ride is over', async () => {
    const t = trip(at(8, 30));
    setTrips([t]);
    const status: TripStatus = {
      state: 'IN_PROGRESS',
      vehicle: '7001',
      departure: { scheduled: t.departure, actual: t.departure },
      arrival: { scheduled: t.arrival, actual: t.arrival },
      position: { latitude: 40.9, longitude: -73.96, speedMph: 20, updated: null },
      retrieved: null,
    };
    jest.mocked(useTripStatuses).mockReturnValue({ [`${t.journeyId}@${t.serviceDate}`]: status });
    await open();

    expect(markers().find((m) => m.id === 'bus')).toMatchObject({ title: `Your bus · Arrived ${formatTime(t.arrival)}`, systemImage: 'bus.fill' });
    expect(screen.queryByText('⏰ Wake me before this stop')).toBeNull();
  });

  it('titles the bus plainly without a live summary', async () => {
    const t = trip(at(10, 30));
    setTrips([t]);
    const status: TripStatus = {
      state: 'SCHEDULED',
      vehicle: null,
      departure: { scheduled: t.departure },
      arrival: { scheduled: t.arrival },
      position: { latitude: 40.76, longitude: -73.99, speedMph: null, updated: null },
      retrieved: null,
    };
    jest.mocked(useTripStatuses).mockReturnValue({ [`${t.journeyId}@${t.serviceDate}`]: status });
    await open();
    expect(markers().find((m) => m.id === 'bus')?.title).toBe('Your bus');
  });

  it('goes back, or home when there is no history', async () => {
    setTrips([trip(at(10, 30))]);
    await open();
    await fireEvent.press(screen.getByText('‹ Back'));
    expect(router.back).toHaveBeenCalled();
    jest.mocked(router.canGoBack).mockReturnValue(false);
    await fireEvent.press(screen.getByText('‹ Back'));
    expect(router.replace).toHaveBeenCalledWith('/');
  });
});
