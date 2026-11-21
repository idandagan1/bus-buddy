import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import RouteScreen from '@/app/route/[id]';
import { formatTime, loadRoutes, saveRoutes, useAdvisories } from '@/api';
import { useTripStatuses } from '@/live';
import { usePartner, useRouteTrips } from '@/routeTrips';
import type { Advisory, Leg, SavedRoute, Stop, Trip, TripStatus } from '@/types';
import { wakeBefore } from '@/wake';

jest.mock('react-native-reanimated', () => {
  const m = jest.requireActual('./reanimatedMock');
  return { __esModule: true, ...m, FadeInLeft: m.FadeIn, FadeInRight: m.FadeIn };
});
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
const mockParams: { id: string; reversed?: string } = { id: 'r1' };
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true), setParams: jest.fn() },
}));
jest.mock('@/routeTrips', () => ({ useRouteTrips: jest.fn(), usePartner: jest.fn() }));
jest.mock('@/api', () => ({ ...jest.requireActual('@/api'), useAdvisories: jest.fn() }));
jest.mock('@/live', () => ({ ...jest.requireActual('@/live'), useTripStatuses: jest.fn() }));
jest.mock('@/wake', () => ({ wakeBefore: jest.fn() }));

// Thursday Nov 19 2026, 10:00 AM in New York.
const NOW = Date.parse('2026-11-19T15:00:00Z');
const at = (h: number, m = 0, day = 19) => new Date(Date.UTC(2026, 10, day, h + 5, m)).toISOString();

const stop = (id: string, name: string, extra: Partial<Stop> = {}): Stop => ({ id, name, town: 'Town', state: 'NJ', latitude: 40.8, longitude: -74, ...extra });
const njtFrom = stop('njt:1', 'Port Authority Bus Terminal', { carrier: 'NJT' });
const njtTo = stop('njt:2', 'Tenafly Ave & Main St', { carrier: 'NJT', routes: ['166', '166X'] });
const coachFrom = stop('c1', 'Port Authority (Coach)');
const coachTo = stop('c2', 'Tenafly (Coach)');

let seq = 0;
const trip = (departure: string, route = '166', extra: Partial<Trip> = {}): Trip => {
  const dep = Date.parse(departure);
  const arrival = new Date(dep + 60 * 60000).toISOString();
  seq += 1;
  return {
    id: `t${seq}`,
    journeyId: `j${seq}`,
    serviceDate: '2026-11-19',
    route,
    carrier: route === '20' ? 'Coach USA' : 'NJ Transit',
    carrierCode: route === '20' ? 'COACH' : 'NJT',
    fromZone: null,
    toZone: null,
    headsign: 'Tenafly',
    gate: null,
    departure,
    arrival,
    approximate: false,
    stops: [
      { name: 'Port Authority Bus Terminal', time: departure, latitude: 40.75, longitude: -73.99 },
      { name: 'Englewood Cliffs', time: new Date(dep + 30 * 60000).toISOString(), latitude: 40.88, longitude: -73.95 },
      { name: 'Tenafly Ave & Main St', time: arrival, latitude: 40.92, longitude: -73.96 },
    ],
    ...extra,
  };
};

type Trips = ReturnType<typeof useRouteTrips>;
const reload = jest.fn();
const setTrips = (trips: Trip[] | null, extra: Partial<Trips> & { other?: Trip[] | null } = {}) => {
  const { other = null, ...rest } = extra;
  const own = trips?.filter((t) => !other?.includes(t)) ?? null;
  jest.mocked(useRouteTrips).mockReturnValue({ trips, error: null, offline: false, cachedAt: null, reload, legs: [own, other], ...rest } as Trips);
};

const route: SavedRoute = { id: 'r1', from: njtFrom, to: njtTo };

async function open(saved: SavedRoute = route) {
  await saveRoutes([saved, { id: 'other', from: coachFrom, to: coachTo }]);
  await render(<RouteScreen />);
  await screen.findByText('‹ My routes');
}

const time = (iso: string) => screen.getByText(formatTime(iso));
// Row badges, not the hero chips that share their spoken label.
const badges = (label: string) => screen.getAllByLabelText(label).filter((el) => el.props.accessibilityRole !== 'button');

beforeEach(async () => {
  jest.useFakeTimers({ now: NOW });
  jest.clearAllMocks();
  mockParams.id = 'r1';
  delete mockParams.reversed;
  await AsyncStorage.clear();
  jest.mocked(usePartner).mockReturnValue(undefined);
  jest.mocked(useAdvisories).mockReturnValue([]);
  jest.mocked(useTripStatuses).mockReturnValue({});
  jest.mocked(router.canGoBack).mockReturnValue(true);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('Schedule screen', () => {
  it('shows a placeholder until the saved route loads, and for an unknown route', async () => {
    setTrips([]);
    mockParams.id = 'missing';
    await render(<RouteScreen />);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(10);
    });
    expect(screen.queryByText('‹ My routes')).toBeNull();
    expect(screen.queryByText('Port Authority Bus Terminal')).toBeNull();
  });

  it('lists the day’s trips with route and gate badges, highlighting the next bus', async () => {
    const past = trip(at(8));
    const next = trip(at(10, 30), '166X', { gate: '410' });
    const later = trip(at(12), '166');
    const tomorrow = trip(at(7, 45, 20), '166');
    setTrips([past, next, later, tomorrow]);
    await open();

    expect(screen.getByText('Port Authority Bus Terminal')).toBeOnTheScreen();
    expect(screen.getByText('→ Tenafly Ave & Main St')).toBeOnTheScreen();
    expect(screen.getByText('NJ Transit')).toBeOnTheScreen();
    expect(time(next.departure)).toBeOnTheScreen();
    expect(screen.getByText(`→ ${formatTime(next.arrival)} · 60 min`)).toBeOnTheScreen();
    expect(screen.getByText('Gate 410')).toBeOnTheScreen();
    // Row badges show just the line, spelled out for screen readers.
    expect(badges('166X Express')).toHaveLength(1);
    expect(badges('166X Express')[0]).toHaveTextContent('166X', { exact: true });
    expect(badges('166 Local')).toHaveLength(2);
    expect(badges('166 Local')[0]).toHaveTextContent('166', { exact: true });
    expect(screen.getByText('in 30 min')).toBeOnTheScreen();
    expect(screen.getByText('in 2h 0m')).toBeOnTheScreen();
    // Tomorrow's bus waits behind its tab.
    expect(screen.getByText('Thu, Nov 19')).toBeOnTheScreen();
    expect(screen.getByText('Fri, Nov 20')).toBeOnTheScreen();
    expect(screen.queryByText(formatTime(tomorrow.departure))).toBeNull();
    expect(screen.getByText('Times from NJ Transit · live status updates every 15 seconds')).toBeOnTheScreen();
  });

  it('switches days from the tabs, and ignores a tap on the current day', async () => {
    const today = trip(at(10, 30));
    const tomorrow = trip(at(7, 15, 20));
    setTrips([today, tomorrow]);
    await open();

    await fireEvent.press(screen.getByText('Thu, Nov 19'));
    expect(time(today.departure)).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Fri, Nov 20'));
    expect(time(tomorrow.departure)).toBeOnTheScreen();
    expect(screen.queryByText(formatTime(today.departure))).toBeNull();
    expect(screen.getByText('in 21h 15m')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Thu, Nov 19'));
    expect(time(today.departure)).toBeOnTheScreen();
  });

  it('expands a trip to its stops, with a map link and a wake-up alarm', async () => {
    const next = trip(at(10, 30));
    setTrips([next]);
    await open();

    // Folded stops stay hidden from riders.
    expect(screen.queryByText('Englewood Cliffs')).toBeNull();
    await fireEvent.press(time(next.departure));
    expect(screen.getByText('Englewood Cliffs')).toBeOnTheScreen();
    expect(screen.getByText(formatTime(next.stops[1].time))).toBeOnTheScreen();
    expect(screen.getByText('before Tenafly Ave & Main St')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('🗺  Map for this ride'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/map', params: { route: 'r1', reversed: '0', trip: next.id } });

    await fireEvent.press(screen.getByText('Wake me up'));
    expect(wakeBefore).toHaveBeenCalledWith(next, null);

    // Tapping again folds it away.
    await fireEvent.press(screen.getAllByText(formatTime(next.departure))[0]);
    expect(screen.queryByText('Englewood Cliffs')).toBeNull();
  });

  it('offers no wake-up alarm once the bus has long arrived', async () => {
    const old = trip(at(6));
    const next = trip(at(11));
    setTrips([old, next]);
    await open();
    await fireEvent.press(time(old.departure));
    expect(screen.queryByText('Wake me up')).toBeNull();
    expect(screen.getByText('🗺  Map for this ride')).toBeOnTheScreen();
  });

  it('starts just before the next bus and pages through a busy day', async () => {
    // 40 buses every 15 minutes from 5:00 AM; the next one is 10:15 (index 21).
    const day = Array.from({ length: 40 }, (_, i) => trip(at(5, i * 15)));
    setTrips(day);
    await open();

    expect(screen.getByText('Show 19 earlier trips')).toBeOnTheScreen();
    expect(screen.queryByText(formatTime(day[18].departure))).toBeNull();
    expect(time(day[19].departure)).toBeOnTheScreen();
    expect(time(day[33].departure)).toBeOnTheScreen();
    expect(screen.queryByText(formatTime(day[34].departure))).toBeNull();

    await fireEvent.press(screen.getByText('Show more trips'));
    expect(time(day[39].departure)).toBeOnTheScreen();
    expect(screen.queryByText('Show more trips')).toBeNull();

    await fireEvent.press(screen.getByText('Show 19 earlier trips'));
    expect(time(day[0].departure)).toBeOnTheScreen();
    expect(screen.queryByText(/earlier trip/)).toBeNull();
  });

  it('loads more trips when scrolled near the bottom', async () => {
    const day = Array.from({ length: 40 }, (_, i) => trip(at(5, i * 15)));
    setTrips(day);
    await open();
    // The page's own scroll view: the nearest one around the trip list.
    let page = time(day[20].departure);
    while (!page.props.onScroll) page = page.parent!;
    const scroll = (y: number) =>
      fireEvent.scroll(page, {
        nativeEvent: { layoutMeasurement: { height: 800 }, contentOffset: { y }, contentSize: { height: 3000 } },
      });

    await scroll(0);
    expect(screen.queryByText(formatTime(day[34].departure))).toBeNull();
    await scroll(1700);
    expect(time(day[34].departure)).toBeOnTheScreen();
    // Nothing left to load.
    await scroll(1700);
    expect(time(day[39].departure)).toBeOnTheScreen();
  });

  it('shows the day’s last buses when none are left, with one earlier trip singular', async () => {
    const day = Array.from({ length: 16 }, (_, i) => trip(at(5, i * 15)));
    setTrips(day);
    await open();
    expect(screen.getByText('Show 1 earlier trip')).toBeOnTheScreen();
    expect(time(day[15].departure)).toBeOnTheScreen();
    expect(screen.queryByText(/in \d/)).toBeNull();
  });

  it('opens the map on the next bus from the header', async () => {
    const past = trip(at(8));
    const next = trip(at(10, 30));
    setTrips([past, next]);
    await open();
    await fireEvent.press(screen.getByText('🗺  Map'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/map', params: { route: 'r1', reversed: '0', trip: next.id } });
  });

  it('opens the map on the last bus when none are left', async () => {
    const a = trip(at(6));
    const b = trip(at(7));
    setTrips([a, b]);
    await open();
    await fireEvent.press(screen.getByText('🗺  Map'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/map', params: { route: 'r1', reversed: '0', trip: b.id } });
  });

  it('flips to the return trip', async () => {
    setTrips([trip(at(10, 30))]);
    await open();
    await fireEvent.press(screen.getByText('Return'));
    expect(router.setParams).toHaveBeenCalledWith({ reversed: '1' });
  });

  it('shows the return direction and flips back', async () => {
    mockParams.reversed = '1';
    setTrips([trip(at(10, 30))]);
    await open();
    expect(screen.getByText('Tenafly Ave & Main St')).toBeOnTheScreen();
    expect(screen.getByText('→ Port Authority Bus Terminal')).toBeOnTheScreen();
    expect(useRouteTrips).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'r1' }), true);
    await fireEvent.press(screen.getByText('Return'));
    expect(router.setParams).toHaveBeenCalledWith({ reversed: '0' });
  });

  it('goes back, or home when there is no history', async () => {
    setTrips([]);
    await open();
    await fireEvent.press(screen.getByText('‹ My routes'));
    expect(router.back).toHaveBeenCalled();
    jest.mocked(router.canGoBack).mockReturnValue(false);
    await fireEvent.press(screen.getByText('‹ My routes'));
    expect(router.replace).toHaveBeenCalledWith('/');
  });

  it('keeps the chips folded behind Filter, which names the lines showing while a filter is on', async () => {
    setTrips([trip(at(10, 30), '166X'), trip(at(11), '166')]);
    await open({ ...route, only: ['166X'] });
    expect(screen.queryByRole('button', { name: 'All' })).toBeNull();
    const filter = screen.getByRole('button', { name: 'Filter: showing 166X only' });
    expect(filter.props.accessibilityState?.expanded).toBe(false);
    await fireEvent.press(filter);
    expect(screen.getByRole('button', { name: 'All' })).toBeOnTheScreen();
  });

  it('filters by line from the hero chips and saves the choice', async () => {
    const express = trip(at(10, 30), '166X');
    const local = trip(at(11), '166');
    setTrips([express, local]);
    await open();
    // The chips sit folded behind the Filter button.
    await fireEvent.press(screen.getByRole('button', { name: /^Filter/ }));

    await fireEvent.press(screen.getByRole('button', { name: '166X Express' }));
    expect(screen.queryByText(formatTime(local.departure))).toBeNull();
    expect(time(express.departure)).toBeOnTheScreen();
    expect((await loadRoutes()).find((r) => r.id === 'r1')?.only).toEqual(['166X']);
    // The other saved route is left alone.
    expect((await loadRoutes()).find((r) => r.id === 'other')).toEqual({ id: 'other', from: coachFrom, to: coachTo });
  });

  it('says when a chosen line has no buses', async () => {
    setTrips([trip(at(10, 30), '166')]);
    await open({ ...route, only: ['166X'] });
    expect(screen.getByText('No 166X buses found for this route.')).toBeOnTheScreen();
  });

  it('says when the route has no buses at all', async () => {
    setTrips([]);
    await open();
    expect(screen.getByText('No buses found for this route.')).toBeOnTheScreen();
  });

  it('offers the other carrier as a dashed chip and adds it', async () => {
    const leg: Leg = { from: coachFrom, to: coachTo };
    jest.mocked(usePartner).mockReturnValue(leg);
    setTrips([trip(at(10, 30))]);
    await open({ ...route, only: ['166'] });
    // The chips sit folded behind the Filter button.
    await fireEvent.press(screen.getByRole('button', { name: /^Filter/ }));

    await fireEvent.press(screen.getByText('+ Coach USA'));
    const saved = (await loadRoutes()).find((r) => r.id === 'r1');
    expect(saved).toEqual({ ...route, also: leg, only: undefined });
  });

  it('merges both carriers, and filtering to one line keeps the other carrier on the route', async () => {
    const also: Leg = { from: coachFrom, to: coachTo };
    const njtNext = trip(at(10, 30), '166X');
    const njtLocal = trip(at(10, 45), '166');
    const coach = trip(at(11), '20');
    setTrips([njtNext, njtLocal, coach], { other: [coach] });
    jest.mocked(usePartner).mockReturnValue(null);
    await open({ ...route, also });
    // The chips sit folded behind the Filter button.
    await fireEvent.press(screen.getByRole('button', { name: /^Filter/ }));

    expect(screen.getByText('NJ Transit')).toBeOnTheScreen();
    expect(screen.getByText('Coach USA')).toBeOnTheScreen();
    expect(badges('Coach 20')[0]).toHaveTextContent('20', { exact: true });
    expect(screen.getByText('Times from Coach USA and NJ Transit · live status updates every 15 seconds')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: '166X Express' }));
    const saved = (await loadRoutes()).find((r) => r.id === 'r1');
    expect(saved?.also).toEqual(also);
    expect(saved?.only).toEqual(['166X']);
    expect(screen.getByRole('button', { name: 'Remove Coach USA' })).toBeOnTheScreen();
  });

  it('shows the other carrier’s tag for the return trip', async () => {
    mockParams.reversed = '1';
    const also: Leg = { from: coachFrom, to: coachTo };
    setTrips([trip(at(10, 30))]);
    await open({ ...route, also });
    expect(screen.getByText('Coach USA')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Remove Coach USA' })).toBeOnTheScreen();
  });

  it('takes the other carrier off with the ✕ on its tag, starting the list over', async () => {
    const also: Leg = { from: coachFrom, to: coachTo };
    const njtNext = trip(at(10, 30), '166X');
    const coach = trip(at(11), '20');
    const tomorrow = trip(at(7, 15, 20), '166X');
    setTrips([njtNext, coach, tomorrow], { other: [coach] });
    await open({ ...route, also, only: ['166X', '20'] });

    // The NJ Transit tag of the route itself can't be removed.
    expect(screen.queryByRole('button', { name: 'Remove NJ Transit' })).toBeNull();
    await fireEvent.press(screen.getByText('Fri, Nov 20'));
    expect(time(tomorrow.departure)).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Remove Coach USA' }));
    const saved = (await loadRoutes()).find((r) => r.id === 'r1');
    expect(saved).toEqual({ ...route, also: undefined, only: undefined });
    expect(screen.queryByText('Coach USA')).toBeNull();
    expect(screen.getByText('Times from NJ Transit · live status updates every 15 seconds')).toBeOnTheScreen();
    // Back on the next bus's day.
    expect(time(njtNext.departure)).toBeOnTheScreen();
  });

  it('removes an added NJ Transit from a Coach USA route', async () => {
    const also: Leg = { from: njtFrom, to: njtTo };
    setTrips([trip(at(10, 30), '20')]);
    await open({ id: 'r1', from: coachFrom, to: coachTo, also });
    await fireEvent.press(screen.getByRole('button', { name: 'Remove NJ Transit' }));
    expect((await loadRoutes()).find((r) => r.id === 'r1')?.also).toBeUndefined();
  });

  it('labels a Coach USA route in the footnote', async () => {
    setTrips([trip(at(10, 30), '20')]);
    await open({ id: 'r1', from: coachFrom, to: coachTo });
    expect(screen.getByText('Times from Coach USA · live status updates every 15 seconds')).toBeOnTheScreen();
  });

  it('shows advisories from both carriers, dropping the tracking notice while buses are live', async () => {
    const adv = (id: string, heading: string): Advisory => ({ id, heading, severity: 'high', paragraphs: [], updated: null });
    const njt = trip(at(10, 30), '166X');
    const coach = trip(at(11), '20');
    jest.mocked(useAdvisories).mockImplementation((trips) =>
      trips?.[0]?.carrierCode === 'NJT' ? [adv('n1', 'Detour on Route 4')] : trips?.[0] ? [adv('bus-tracking-1', 'Live tracking unavailable')] : [],
    );
    setTrips([njt, coach], { other: [coach] });
    await open({ ...route, also: { from: coachFrom, to: coachTo } });
    expect(screen.getByText('Detour on Route 4')).toBeOnTheScreen();
    expect(screen.getByText('Live tracking unavailable')).toBeOnTheScreen();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });

    const status: TripStatus = {
      state: 'SCHEDULED',
      vehicle: '7001',
      departure: { scheduled: njt.departure, estimated: new Date(Date.parse(njt.departure) + 5 * 60000).toISOString() },
      arrival: { scheduled: njt.arrival },
      position: null,
      retrieved: null,
    };
    jest.mocked(useTripStatuses).mockReturnValue({ [`${njt.journeyId}@${njt.serviceDate}`]: status });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(30000);
    });
    expect(screen.getByText('Detour on Route 4')).toBeOnTheScreen();
    expect(screen.queryByText('Live tracking unavailable')).toBeNull();
    expect(screen.getByText('Leaving 5 min late')).toBeOnTheScreen();
    // Countdown follows the live departure.
    expect(screen.getByText('in 35 min')).toBeOnTheScreen();
  });

  it('shows the error and retries when nothing loaded', async () => {
    setTrips(null, { error: 'Coach USA is down.' });
    await open();
    expect(screen.getByText("Couldn't load data")).toBeOnTheScreen();
    expect(screen.getByText('Coach USA is down. Try again in a moment.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Try again'));
    expect(reload).toHaveBeenCalled();
  });

  it('shows the offline state when nothing loaded', async () => {
    setTrips(null, { error: 'No internet connection', offline: true });
    await open();
    expect(screen.getByText('No internet connection')).toBeOnTheScreen();
  });

  it('shows placeholders while loading', async () => {
    setTrips(null);
    await open();
    expect(screen.queryByText("Couldn't load data")).toBeNull();
    expect(screen.queryByText(/buses found/)).toBeNull();
  });

  it('notes a saved schedule while offline or after a failed refresh', async () => {
    const next = trip(at(10, 30));
    setTrips([next], { offline: true });
    await open();
    expect(screen.getByText('📡 Offline · Showing saved schedule')).toBeOnTheScreen();
    screen.unmount();

    setTrips([next], { cachedAt: NOW - 5 * 60000 });
    await open();
    expect(screen.getByText(`↻ Showing saved schedule from ${formatTime(new Date(NOW - 5 * 60000).toISOString())}`)).toBeOnTheScreen();
  });
});
