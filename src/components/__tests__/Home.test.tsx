import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Alert, Linking, Platform } from 'react-native';
import { loadRoutes, useAdvisories } from '@/api';
import Home from '@/app/index';
import { useDirection } from '@/direction';
import { useWeather } from '@/weather';
import { useRoadWork } from '@/roadWork';
import { useTraffic } from '@/traffic';
import { useFirstRun } from '@/firstRun';
import { useTripStatuses } from '@/live';
import { usePartner, useRouteTrips } from '@/routeTrips';
import type { Advisory, Leg, SavedRoute, Stop, Trip, TripStatus } from '@/types';

jest.mock('react-native-reanimated', () => jest.requireActual('./reanimatedMock'));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: (cb: () => void) => jest.requireActual('react').useEffect(cb, [cb]),
}));
jest.mock('@/api', () => ({ ...jest.requireActual('@/api'), useAdvisories: jest.fn() }));
jest.mock('@/routeTrips', () => ({ useRouteTrips: jest.fn(), usePartner: jest.fn() }));
jest.mock('@/live', () => ({ ...jest.requireActual('@/live'), useTripStatuses: jest.fn() }));
jest.mock('@/direction', () => ({ useDirection: jest.fn() }));
jest.mock('@/roadWork', () => ({ useRoadWork: jest.fn() }));
jest.mock('@/traffic', () => ({ ...jest.requireActual('@/traffic'), useTraffic: jest.fn() }));
jest.mock('@/weather', () => ({ ...jest.requireActual('@/weather'), useWeather: jest.fn() }));
jest.mock('@/firstRun', () => ({ useFirstRun: jest.fn(), finishNudge: jest.fn() }));
jest.mock('@/components/InstallCard', () => {
  const { Text } = jest.requireActual('react-native');
  return { InstallCard: () => <Text>Install card</Text> };
});
jest.mock('@/components/MyAlarms', () => {
  const { Text } = jest.requireActual('react-native');
  return { MyAlarms: () => <Text>My alarms</Text> };
});
// The planner has its own tests; here it shows the nudge it was handed and saves two fixed stops.
jest.mock('@/components/RoutePlanner', () => {
  const { Pressable, Text } = jest.requireActual('react-native');
  return {
    RoutePlanner: (p: { onSave: (from: Stop, to: Stop) => void; saveLabel: string; nudge?: string }) => (
      <>
        <Text>{`nudge: ${p.nudge ?? 'none'}`}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            p.onSave(
              { id: 'c1', name: 'Port Authority Bus Terminal', town: 'New York', state: 'NY', latitude: 40.75, longitude: -73.99 },
              { id: 'c2', name: 'Tenafly Ave & Main St', town: 'Tenafly', state: 'NJ', latitude: 40.92, longitude: -73.96 },
            )
          }
        >
          <Text>{p.saveLabel}</Text>
        </Pressable>
      </>
    ),
  };
});

const NOW = Date.parse('2026-11-19T17:00:00Z'); // 12:00 PM in New York
const MIN = 60000;
const iso = (ms: number) => new Date(ms).toISOString();

const stop = (id: string, name: string, town: string, extra: Partial<Stop> = {}): Stop => ({
  id,
  name,
  town,
  state: 'NJ',
  latitude: 40.9,
  longitude: -73.9,
  ...extra,
});
const pabt = stop('c1', 'Port Authority Bus Terminal', 'New York');
const tenafly = stop('c2', 'Tenafly Ave & Main St', 'Tenafly');
const njtFrom = stop('njt:1', 'Port Authority Bus Terminal', 'New York', { carrier: 'NJT' });
const njtTo = stop('njt:2', 'Tenafly Ave at Main St', 'Tenafly', { carrier: 'NJT', routes: ['166'] });
const partner: Leg = { from: njtFrom, to: njtTo };

const trip = (id: string, route: string, depMin: number, extra: Partial<Trip> = {}): Trip => ({
  id,
  journeyId: `j-${id}`,
  serviceDate: '2026-11-19',
  route,
  carrier: route === '20' ? 'Coach USA' : 'NJ Transit',
  carrierCode: route === '20' ? 'COACH' : 'NJT',
  fromZone: null,
  toZone: null,
  headsign: 'Tenafly',
  gate: null,
  departure: iso(NOW + depMin * MIN),
  arrival: iso(NOW + (depMin + 50) * MIN),
  approximate: false,
  stops: [],
  ...extra,
});

const status = (t: Trip, depLateMin: number, arrLateMin: number): TripStatus => ({
  state: 'SCHEDULED',
  vehicle: null,
  departure: { scheduled: t.departure, estimated: iso(Date.parse(t.departure) + depLateMin * MIN) },
  arrival: { scheduled: t.arrival, estimated: iso(Date.parse(t.arrival) + arrLateMin * MIN) },
  position: null,
  retrieved: null,
});

type Loaded = {
  trips: Trip[] | null;
  error?: string | null;
  offline?: boolean;
  cachedAt?: number | null;
  legs?: readonly [Trip[] | null, Trip[] | null];
};
const reload = jest.fn();
// What the trip hook answers, by the route and direction asked for.
let schedule: (route: SavedRoute, reversed: boolean) => Loaded;
let statuses: Record<string, TripStatus | null>;

const njt = [trip('a', '166X', 45, { gate: '410' }), trip('b', '166', 70), trip('c', '166X', 100), trip('d', '166', 130)];

const save = (routes: SavedRoute[]) => AsyncStorage.setItem('savedRoutes', JSON.stringify(routes));
const flush = (ms = 0) =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
const show = async () => {
  await render(<Home />);
  await flush();
};
const setOS = (os: string) => Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
const realOS = Platform.OS;

beforeEach(async () => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
  await AsyncStorage.clear();
  statuses = {};
  schedule = () => ({ trips: njt });
  jest.mocked(useRouteTrips).mockImplementation((route, reversed) => {
    const r = schedule(route, reversed);
    return {
      key: `${route.id}:${reversed}`,
      trips: r.trips,
      error: r.error ?? null,
      offline: r.offline ?? false,
      cachedAt: r.cachedAt ?? null,
      legs: r.legs ?? [r.trips, null],
      reload,
    };
  });
  jest.mocked(usePartner).mockReturnValue(null);
  jest.mocked(useTripStatuses).mockImplementation(() => statuses);
  jest.mocked(useDirection).mockImplementation((route) => ({ from: route.from, to: route.to, reversed: false }));
  jest.mocked(useAdvisories).mockReturnValue([]);
  jest.mocked(useWeather).mockReturnValue(null);
  jest.mocked(useRoadWork).mockReturnValue([]);
  jest.mocked(useTraffic).mockReturnValue([]);
  jest.mocked(useFirstRun).mockReturnValue({ welcome: false, nudge: false });
});

afterEach(() => {
  setOS(realOS);
  jest.useRealTimers();
  jest.clearAllMocks();
});

describe('Home: first visit', () => {
  it('invites the first route and saves it', async () => {
    jest.mocked(useFirstRun).mockReturnValue({ welcome: true, nudge: true });
    await show();
    expect(screen.getByText(/^Good (morning|afternoon|evening) 👋$/)).toBeOnTheScreen();
    expect(screen.getByText("Let's add your first route")).toBeOnTheScreen();
    expect(screen.getByText('Save once - see it later.')).toBeOnTheScreen();
    // The From nudge waits for the welcome scene to finish.
    expect(screen.getByText('nudge: waiting')).toBeOnTheScreen();
    expect(screen.queryByText('Install card')).toBeNull();
    expect(screen.queryByText('My routes')).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Save my route' }));
    await flush();
    expect(await loadRoutes()).toEqual([
      { id: String(NOW), from: expect.objectContaining({ id: 'c1' }), to: expect.objectContaining({ id: 'c2' }) },
    ]);
    expect(screen.getByText('My routes')).toBeOnTheScreen();
    expect(screen.getByText('Install card')).toBeOnTheScreen();
    expect(screen.queryByText("Let's add your first route")).toBeNull();
  });

  it('nudges right away once welcomed, and not at all once nudged', async () => {
    jest.mocked(useFirstRun).mockReturnValue({ welcome: false, nudge: true });
    await show();
    expect(screen.getByText('nudge: now')).toBeOnTheScreen();
    await screen.unmount();

    jest.mocked(useFirstRun).mockReturnValue({ welcome: false, nudge: false });
    await show();
    expect(screen.getByText('nudge: none')).toBeOnTheScreen();
  });

  it('holds the planner until first-run state is known', async () => {
    jest.mocked(useFirstRun).mockReturnValue(null);
    await show();
    expect(screen.getByText("Let's add your first route")).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Save my route' })).toBeNull();
  });
});

describe('Home: saved routes', () => {
  const r1: SavedRoute = { id: 'r1', from: pabt, to: tenafly };
  const r2: SavedRoute = { id: 'r2', from: tenafly, to: pabt };

  it('counts down to the next bus and lists the next three on each card', async () => {
    await save([r1, r2]);
    await show();
    expect(screen.getByText('Your next bus')).toBeOnTheScreen();
    expect(screen.getByText('New York → Tenafly · 166X')).toBeOnTheScreen();
    expect(screen.getByText('45:00')).toBeOnTheScreen();
    expect(screen.getByText('Gate 410 · arrives 1:35 PM')).toBeOnTheScreen();
    expect(screen.getByText('My routes')).toBeOnTheScreen();
    expect(screen.getByText('2')).toBeOnTheScreen();
    expect(screen.getByText('My alarms')).toBeOnTheScreen();
    expect(screen.getByText('Install card')).toBeOnTheScreen();

    // Each card: its next bus highlighted, then two more; the fourth waits.
    expect(screen.getAllByText('12:45 PM')).toHaveLength(3);
    expect(screen.getAllByText('in 45 min')).toHaveLength(2);
    expect(screen.getAllByText('1:10 PM')).toHaveLength(2);
    expect(screen.getAllByText('1:40 PM')).toHaveLength(2);
    expect(screen.queryByText('2:10 PM')).toBeNull();
    expect(screen.getAllByText('Gate 410').length).toBeGreaterThan(0);

    await flush(1000);
    expect(screen.getByText('44:59')).toBeOnTheScreen();
  });

  it('shows hours on a far-off bus', async () => {
    schedule = () => ({ trips: [trip('far', '166', 125)] });
    await save([r1]);
    await show();
    expect(screen.getByText('2:05:00')).toBeOnTheScreen();
    expect(screen.getByText('New York → Tenafly · 166')).toBeOnTheScreen();
    expect(screen.getByText('arrives 2:55 PM')).toBeOnTheScreen();
  });

  it('keeps a bus that just left on the card for a minute, but counts down to the one after', async () => {
    schedule = () => ({ trips: [trip('gone', '166', -0.5), trip('next', '166', 20)] });
    await save([r1]);
    await show();
    expect(screen.getByText('11:59 AM')).toBeOnTheScreen();
    expect(screen.getByText('now')).toBeOnTheScreen();
    expect(screen.getByText('20:00')).toBeOnTheScreen();
  });

  it('shows live delays on the hero, the next bus and later buses', async () => {
    statuses = {
      'j-a@2026-11-19': status(njt[0], 5, 6),
      'j-b@2026-11-19': status(njt[1], 2, 4),
      'j-c@2026-11-19': status(njt[2], -2, -3),
    };
    await save([r1]);
    await show();
    expect(screen.getAllByText('Leaving 5 min late')).toHaveLength(2);
    expect(screen.getByText('50:00')).toBeOnTheScreen();
    expect(screen.getByText('Gate 410 · arrives 1:41 PM')).toBeOnTheScreen();
    expect(screen.getByText('+4 min')).toBeOnTheScreen();
    expect(screen.getByText('-3 min')).toBeOnTheScreen();
  });

  it('opens the map, the schedule, settings, a new route and the editor', async () => {
    await save([r1]);
    await show();
    await fireEvent.press(screen.getByText('🗺  Map'));
    expect(router.push).toHaveBeenLastCalledWith({ pathname: '/map', params: { route: 'r1', reversed: '0', trip: 'a' } });
    await fireEvent.press(screen.getByText('Port Authority Bus Terminal'));
    expect(router.push).toHaveBeenLastCalledWith({ pathname: '/route/[id]', params: { id: 'r1', reversed: '0' } });
    await fireEvent.press(screen.getByText('⚙︎'));
    expect(router.push).toHaveBeenLastCalledWith('/settings');
    await fireEvent.press(screen.getByText('＋ Add route'));
    expect(router.push).toHaveBeenLastCalledWith('/add');
    await fireEvent.press(screen.getByText('✎  Edit'));
    expect(router.push).toHaveBeenLastCalledWith({ pathname: '/add', params: { edit: 'r1' } });
  });

  it('hides settings on the website, where the wake-up alarm doesn’t run', async () => {
    setOS('web');
    await save([]);
    await show();
    expect(screen.queryByText('⚙︎')).toBeNull();
  });

  it('follows the likely direction home on the hero', async () => {
    jest.mocked(useDirection).mockImplementation((route) => ({ from: route.to, to: route.from, reversed: true }));
    await save([r1]);
    await show();
    expect(screen.getByText('Tenafly → New York · 166X')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('🗺  Map'));
    expect(router.push).toHaveBeenLastCalledWith({ pathname: '/map', params: { route: 'r1', reversed: '1', trip: 'a' } });
  });

  it('has no map button on Android', async () => {
    setOS('android');
    await save([r1]);
    await show();
    expect(screen.getByText('45:00')).toBeOnTheScreen();
    expect(screen.queryByText('🗺  Map')).toBeNull();
    expect(screen.queryByText('My alarms')).toBeNull();
  });

  it('swaps a card to the ride back', async () => {
    schedule = (_route, reversed) => ({ trips: reversed ? [trip('back', '166', 15)] : njt });
    await save([r1]);
    await show();
    expect(screen.getByText('→ Tenafly Ave & Main St')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('⇅'));
    expect(screen.getByText('Tenafly Ave & Main St')).toBeOnTheScreen();
    expect(screen.getByText('→ Port Authority Bus Terminal')).toBeOnTheScreen();
    expect(screen.getByText('in 15 min')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Tenafly Ave & Main St'));
    expect(router.push).toHaveBeenLastCalledWith({ pathname: '/route/[id]', params: { id: 'r1', reversed: '1' } });
    await fireEvent.press(screen.getByText('⇅'));
    expect(screen.getByText('→ Tenafly Ave & Main St')).toBeOnTheScreen();
  });

  it('removes a route once confirmed', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await save([r1, r2]);
    await show();
    await fireEvent.press(screen.getAllByText('✕  Remove')[0]);
    expect(alert).toHaveBeenCalledWith('Remove this route?', 'Port Authority Bus Terminal → Tenafly Ave & Main St', expect.any(Array));
    const buttons = alert.mock.calls[0][2]!;
    expect(buttons.map((b) => b.text)).toEqual(['Cancel', 'Remove']);
    await act(async () => buttons[1].onPress!());
    await flush();
    expect(await loadRoutes()).toEqual([r2]);
    expect(screen.getByText('1')).toBeOnTheScreen();
    alert.mockRestore();
  });

  it('asks the browser to confirm on the web', async () => {
    const confirm = jest.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    (globalThis as unknown as { confirm: typeof confirm }).confirm = confirm;
    await save([r1]);
    await show();
    setOS('web');
    await fireEvent.press(screen.getByText('✕  Remove'));
    expect(confirm).toHaveBeenCalledWith('Remove this route?\n\nPort Authority Bus Terminal → Tenafly Ave & Main St');
    await flush();
    expect(await loadRoutes()).toEqual([r1]);
    await fireEvent.press(screen.getByText('✕  Remove'));
    await flush();
    expect(await loadRoutes()).toEqual([]);
    expect(screen.queryByText('My routes')).toBeNull();
  });

  it('shows high-severity alerts and detours, whatever their severity', async () => {
    const advisory = (id: string, severity: Advisory['severity'], heading: string, paragraphs: string[] = []): Advisory => ({
      id,
      severity,
      heading,
      paragraphs,
      updated: null,
    });
    jest
      .mocked(useAdvisories)
      .mockImplementation((trips) =>
        trips?.length
          ? [
              advisory('1', 'high', 'Service suspended'),
              advisory('2', 'low', 'Tenafly changes', ['Buses detour via Engle St.']),
              advisory('3', 'low', 'Elevator out'),
            ]
          : [],
      );
    await save([r1]);
    await show();
    expect(screen.getByText('⚠️  Service suspended')).toBeOnTheScreen();
    expect(screen.getByText('↪️  Tenafly changes')).toBeOnTheScreen();
    expect(screen.queryByText(/Elevator out/)).toBeNull();
  });

  it('flags a detour on the street of a saved stop, with the alert’s full text', async () => {
    const detour: Advisory = {
      id: 'd',
      severity: 'low',
      heading: 'Bus route 166 is on a detour on Main St between Elm St and Oak St in Tenafly due to road closure.',
      paragraphs: ['Buses will use Elm St.'],
      updated: null,
    };
    jest.mocked(useAdvisories).mockImplementation((trips) => (trips?.length ? [detour] : []));
    await save([r1]);
    await show();
    expect(screen.getByText('↪️  Detour near your stop in Tenafly: buses may skip it')).toBeOnTheScreen();
    expect(screen.getByText(`${detour.heading} Buses will use Elm St.`)).toBeOnTheScreen();
  });
});

describe('Home: loading and errors', () => {
  const r1: SavedRoute = { id: 'r1', from: pabt, to: tenafly, only: ['166X'] };

  it('shows placeholders while loading, and the hero gives up after a while', async () => {
    schedule = () => ({ trips: null });
    await save([r1]);
    await show();
    expect(screen.getByText('Your next bus')).toBeOnTheScreen();
    await flush(7999);
    expect(screen.getByText('Your next bus')).toBeOnTheScreen();
    await flush(1);
    expect(screen.getByText('Your buses')).toBeOnTheScreen();
    expect(screen.queryByText('Your next bus')).toBeNull();
  });

  it('shows the error on the card with a retry', async () => {
    schedule = () => ({ trips: null, error: 'Coach USA is down.' });
    await save([r1]);
    await show();
    expect(screen.getByText('Your buses')).toBeOnTheScreen();
    expect(screen.getByText("Couldn't load data")).toBeOnTheScreen();
    expect(screen.getByText('Coach USA is down. Try again in a moment.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Try again'));
    expect(reload).toHaveBeenCalled();
  });

  it('marks a saved schedule shown offline', async () => {
    schedule = () => ({ trips: njt, offline: true });
    await save([r1]);
    await show();
    expect(screen.getByText('📡 Offline · Showing saved schedule')).toBeOnTheScreen();
  });

  it('says when no more of the chosen line run', async () => {
    schedule = () => ({ trips: [trip('x', '166', 30)] });
    await save([r1]);
    await show();
    expect(screen.getByText('Your buses')).toBeOnTheScreen();
    expect(screen.getByText('No more 166X buses in the next few days.')).toBeOnTheScreen();
  });

  it('says when no buses run at all', async () => {
    schedule = () => ({ trips: [] });
    await save([{ id: 'r1', from: pabt, to: tenafly }]);
    await show();
    expect(screen.getByText('No more buses in the next few days.')).toBeOnTheScreen();
  });
});

describe('Home: traffic', () => {
  const incident = (id: string, kind: 'accident' | 'road-works', point: [number, number], extra = {}) => ({
    id, kind, what: 'Stationary traffic', road: 'US-9W', from: 'Clinton Ave', to: null, delayMin: 6, until: null, points: [point], ...extra,
  });

  it('shows incidents on the next bus’s way, urgent ones first in orange', async () => {
    // The test trips list no stops, so the way is straight from Port Authority to Tenafly.
    const mid: [number, number] = [(pabt.latitude + tenafly.latitude) / 2, (pabt.longitude + tenafly.longitude) / 2];
    jest.mocked(useTraffic).mockReturnValue([
      incident('i1', 'accident', mid),
      incident('i2', 'road-works', [41.2, -74.3]),
      incident('i3', 'road-works', mid, { delayMin: null, what: null }),
    ]);
    await save([{ id: 'r1', from: pabt, to: tenafly }]);
    await show();
    expect(jest.mocked(useTraffic)).toHaveBeenCalledWith(true);
    expect(screen.getByText('🚨\u00A0 Accident on US-9W near Clinton Ave · +6 min')).toBeOnTheScreen();
    expect(screen.getByText("Stationary traffic · on your bus's way")).toBeOnTheScreen();
    expect(screen.getByText('🚧\u00A0 Road works on US-9W near Clinton Ave')).toBeOnTheScreen();
    expect(screen.getAllByText(/near Clinton Ave/)).toHaveLength(2);
  });

  it('doesn’t ask about traffic with no bus coming', async () => {
    schedule = () => ({ trips: [] });
    await save([{ id: 'r1', from: pabt, to: tenafly }]);
    await show();
    expect(jest.mocked(useTraffic)).toHaveBeenCalledWith(false);
    expect(jest.mocked(useTraffic)).not.toHaveBeenCalledWith(true);
  });
});

describe('Home: town road work', () => {
  const gas = { town: 'Tenafly', title: 'JFC TENAFLY GAS WORK SCHEDULE', link: 'https://www.tenaflynj.gov/gas', posted: '2026-11-19T20:08:00.000Z' };
  const paving = { ...gas, title: 'Paving on Engle St', link: 'https://www.tenaflynj.gov/paving' };
  const sewer = { ...gas, title: 'Sewer work', link: 'https://www.tenaflynj.gov/sewer' };

  it('shows two notices, each opening on tap with a button to the notice', async () => {
    jest.mocked(useRoadWork).mockReturnValue([gas, paving]);
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await save([{ id: 'r1', from: pabt, to: tenafly }]);
    await show();
    expect(jest.mocked(useRoadWork).mock.calls[0][0]).toEqual([pabt, tenafly]);
    expect(screen.getByText('🚧\u00A0 Road work in Tenafly: JFC TENAFLY GAS WORK SCHEDULE')).toBeOnTheScreen();
    expect(screen.getByText('🚧\u00A0 Road work in Tenafly: Paving on Engle St')).toBeOnTheScreen();
    // Closed, a notice is just its line.
    expect(screen.queryByText('Posted Thu, Nov 19')).toBeNull();
    expect(screen.queryByText(/^\d+ more:/)).toBeNull();
    await fireEvent.press(screen.getByText('🚧\u00A0 Road work in Tenafly: Paving on Engle St'));
    expect(screen.getByText('Posted Thu, Nov 19')).toBeOnTheScreen();
    expect(open).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Read more ›'));
    expect(open).toHaveBeenCalledWith('https://www.tenaflynj.gov/paving');
    await fireEvent.press(screen.getByText('🚧\u00A0 Road work in Tenafly: Paving on Engle St'));
    expect(screen.queryByText('Posted Thu, Nov 19')).toBeNull();
  });

  it('folds notes past two into one line that opens them', async () => {
    jest.mocked(useRoadWork).mockReturnValue([gas, paving, sewer]);
    // Only the route's one carrier has trips, so the alert comes once.
    jest.mocked(useAdvisories).mockImplementation((trips) => (trips?.length ? [{ id: 'pa', heading: 'Port Authority Construction Advisory', severity: 'high', paragraphs: [], updated: null }] : []));
    await save([{ id: 'r1', from: pabt, to: tenafly }]);
    await show();
    // The service alert ranks first and shows in full; the three road works fold.
    expect(screen.getByText('⚠️\u00A0 Port Authority Construction Advisory')).toBeOnTheScreen();
    const more = screen.getByText('3 more: road work ×3');
    expect(screen.queryByText(/Sewer work/)).toBeNull();
    await fireEvent.press(more);
    expect(screen.getByText('Hide 3 more')).toBeOnTheScreen();
    expect(screen.getByText('🚧\u00A0 Road work in Tenafly: Sewer work')).toBeOnTheScreen();
    // Folded notes are one line each, without their explanation.
    expect(screen.queryByText('Posted Thu, Nov 19')).toBeNull();
    await fireEvent.press(screen.getByText('Hide 3 more'));
    expect(screen.getByText('3 more: road work ×3')).toBeOnTheScreen();
  });

  it('shows nothing without notices', async () => {
    await save([{ id: 'r1', from: pabt, to: tenafly }]);
    await show();
    expect(screen.queryByText(/Road work/)).toBeNull();
  });
});

describe('Home: weather', () => {
  // The first bus leaves at 12:45 PM and arrives at 1:35 PM (New York).
  const hourAt = (min: number, rain: number) => ({ time: iso(NOW + min * MIN), rain });

  it('shows today’s sky as an icon, and no umbrella on a dry ride', async () => {
    jest.mocked(useWeather).mockReturnValue({ source: 'open-meteo', today: 'partly', hours: [hourAt(60, 10)], checked: iso(NOW - 9 * MIN) });
    await save([{ id: 'r1', from: pabt, to: tenafly }]);
    await show();
    expect(screen.getByText('⛅ Partly cloudy in New York')).toBeOnTheScreen();
    expect(screen.getByText('as of 11:51 AM')).toBeOnTheScreen();
    expect(screen.queryByText(/umbrella/)).toBeNull();
  });

  it('reminds to bring an umbrella when rain is likely during the next ride', async () => {
    jest.mocked(useWeather).mockReturnValue({ source: 'nws', today: 'rain', hours: [hourAt(0, 30), hourAt(60, 70)] });
    await save([{ id: 'r1', from: pabt, to: tenafly }]);
    await show();
    expect(screen.getByText('☔ Rain likely around 1 PM, bring an umbrella')).toBeOnTheScreen();
    expect(screen.getByText('🌧️ Rain in New York')).toBeOnTheScreen();
  });

  it('names the town the rider is leaving from, going home too', async () => {
    jest.mocked(useWeather).mockReturnValue({ source: 'open-meteo', today: 'clear', hours: [] });
    jest.mocked(useDirection).mockImplementation((route) => ({ from: route.to, to: route.from, reversed: true }));
    await save([{ id: 'r1', from: pabt, to: tenafly }]);
    await show();
    expect(screen.getByText('☀️ Sunny in Tenafly')).toBeOnTheScreen();
    // Without a check time, only the sky shows.
    expect(screen.queryByText(/^as of/)).toBeNull();
  });

  it('warns of a weather alert above the routes, once even when both ends have it', async () => {
    const storm = { id: 'w1', event: 'Winter Storm Warning', severity: 'Severe' as const, what: 'Heavy snow expected.', until: iso(NOW + 6 * 60 * MIN) };
    jest.mocked(useWeather).mockReturnValue({ source: 'open-meteo', today: 'snow', hours: [], alerts: [storm] });
    await save([{ id: 'r1', from: pabt, to: tenafly }]);
    await show();
    expect(screen.getAllByText('⚠️\u00A0 Winter Storm Warning until 6 PM')).toHaveLength(1);
    expect(screen.getByText('Heavy snow expected.')).toBeOnTheScreen();
  });

  it('leaves out an unknown end and an empty gist', async () => {
    const wind = { id: 'w2', event: 'Wind Advisory', severity: 'Moderate' as const, what: '', until: null };
    jest.mocked(useWeather).mockReturnValue({ source: 'nws', today: null, hours: [], alerts: [wind] });
    await save([{ id: 'r1', from: pabt, to: tenafly }]);
    await show();
    expect(screen.getByText('⚠️\u00A0 Wind Advisory')).toBeOnTheScreen();
  });

  it('folds weather alerts past two: the most serious in full, the rest in one line that opens them', async () => {
    const alert = (id: string, event: string, severity: 'Moderate' | 'Severe') => ({ id, event, severity, what: `${event} details.`, until: null });
    const alerts = [alert('w1', 'Wind Advisory', 'Moderate'), alert('w2', 'Flood Warning', 'Severe'), alert('w3', 'Freeze Watch', 'Moderate')];
    jest.mocked(useWeather).mockReturnValue({ source: 'nws', today: null, hours: [], alerts });
    await save([{ id: 'r1', from: pabt, to: tenafly }]);
    await show();
    expect(screen.getByText('⚠️\u00A0 Flood Warning')).toBeOnTheScreen();
    expect(screen.getByText('Flood Warning details.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('2 more: wind advisory · freeze watch'));
    expect(screen.getByText('Hide 2 more')).toBeOnTheScreen();
  });

  it('shows nothing while the weather is unknown, or with no sky for today', async () => {
    await save([{ id: 'r1', from: pabt, to: tenafly }]);
    await show();
    expect(screen.queryByText(/ in New York$/)).toBeNull();
    jest.mocked(useWeather).mockReturnValue({ source: 'nws', today: null, hours: [] });
    await show();
    expect(screen.queryByText(/ in New York$/)).toBeNull();
  });
});

describe('Home: line chips', () => {
  const chip = (name: string) => screen.getByRole('button', { name });
  const selected = (name: string) => chip(name).props.accessibilityState?.selected;
  const filterButton = () => screen.getByRole('button', { name: /^Filter/ });
  // The chips sit folded behind the card's Filter button.
  const showChips = async () => {
    await show();
    await fireEvent.press(filterButton());
  };

  it('keeps the chips folded away until Filter is tapped, and folds them again', async () => {
    await save([{ id: 'r1', from: pabt, to: tenafly }]);
    await show();
    expect(screen.queryByRole('button', { name: 'All' })).toBeNull();
    expect(filterButton()).toHaveAccessibleName('Filter lines');
    expect(filterButton().props.accessibilityState?.expanded).toBe(false);
    await fireEvent.press(filterButton());
    expect(selected('All')).toBe(true);
    expect(filterButton().props.accessibilityState?.expanded).toBe(true);
    await fireEvent.press(filterButton());
    expect(screen.queryByRole('button', { name: 'All' })).toBeNull();
  });

  it('names the lines showing on the folded button while a filter is on', async () => {
    await save([{ id: 'r1', from: pabt, to: tenafly, only: ['166X'] }]);
    await show();
    expect(filterButton()).toHaveAccessibleName('Filter: showing 166X only');
    expect(screen.getByText('166X')).toBeOnTheScreen();
  });

  it('has no Filter button with nothing to choose and nothing to add', async () => {
    schedule = () => ({ trips: [trip('only', '166', 30)] });
    await save([{ id: 'r1', from: pabt, to: tenafly }]);
    await show();
    expect(screen.queryByRole('button', { name: /^Filter/ })).toBeNull();
  });

  it('narrows a card to one line and back to all', async () => {
    await save([{ id: 'r1', from: pabt, to: tenafly }]);
    await showChips();
    expect(selected('All')).toBe(true);
    await fireEvent.press(chip('166X Express'));
    await flush();
    expect((await loadRoutes())[0].only).toEqual(['166X']);
    expect(selected('166X Express')).toBe(true);
    expect(selected('All')).toBe(false);
    // Only 166X buses are left on the card.
    expect(screen.queryByText('1:10 PM')).toBeNull();
    expect(screen.getAllByText('1:40 PM').length).toBeGreaterThan(0);

    await fireEvent.press(chip('All'));
    await flush();
    expect((await loadRoutes())[0].only).toBeUndefined();
  });

  it('names a sooner bus the choice hides, and tapping it shows every line', async () => {
    await save([{ id: 'r1', from: pabt, to: tenafly, only: ['166'] }]);
    await showChips();
    // The 166X at 12:45 leaves before the next 166 at 1:10, on the hero and the card.
    expect(screen.getByText('A 166X leaves sooner, at 12:45 PM')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'A 166X leaves sooner, at 12:45 PM. Show all lines' }));
    await flush();
    expect((await loadRoutes())[0].only).toBeUndefined();
    expect(screen.queryByText(/is sooner/)).toBeNull();
  });

  it('says nothing more when the choice hides no sooner bus', async () => {
    await save([{ id: 'r1', from: pabt, to: tenafly, only: ['166X'] }]);
    await showChips();
    expect(screen.queryByText(/is sooner/)).toBeNull();
  });

  it('offers the other carrier on the same corner and adds it', async () => {
    jest.mocked(usePartner).mockReturnValue(partner);
    await save([{ id: 'r1', from: pabt, to: tenafly, only: ['166X'] }]);
    await showChips();
    await fireEvent.press(chip('+ 166 NJT'));
    await flush();
    // Line choices start over with the other carrier's buses added.
    expect(await loadRoutes()).toEqual([{ id: 'r1', from: pabt, to: tenafly, also: partner }]);
  });

  it('offers no partner once one is added, and names a partner without known lines by carrier', async () => {
    jest.mocked(usePartner).mockReturnValue({ from: njtFrom, to: { ...njtTo, routes: undefined } });
    schedule = () => ({ trips: [trip('only', '166', 30)] });
    await save([{ id: 'r1', from: pabt, to: tenafly }]);
    await showChips();
    expect(chip('+ NJ Transit')).toBeOnTheScreen();
    // A single line has nothing to choose between.
    expect(screen.queryByRole('button', { name: 'All' })).toBeNull();
  });

  describe('with the other carrier added', () => {
    const coach = [trip('k', '20', 40), trip('l', '20', 90)];
    const nj = [trip('m', '166', 60)];
    const both: SavedRoute = { id: 'r1', from: pabt, to: tenafly, also: partner };

    beforeEach(() => {
      schedule = () => ({ trips: [...coach, ...nj].sort((a, b) => a.departure.localeCompare(b.departure)), legs: [coach, nj] });
    });

    it('labels each carrier and lists both by departure', async () => {
      await save([both]);
      await showChips();
      expect(screen.getByText('New York → Tenafly · 20')).toBeOnTheScreen();
      expect(chip('Coach 20')).toBeOnTheScreen();
      expect(chip('166')).toBeOnTheScreen();
      expect(screen.getByText('Coach USA')).toBeOnTheScreen();
      expect(screen.getByText('NJ Transit')).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: /^\+/ })).toBeNull();
      // Only the added carrier can be taken off.
      expect(screen.queryByRole('button', { name: 'Remove Coach USA' })).toBeNull();
    });

    it('takes the added carrier off with its ✕, and its line choice with it', async () => {
      await save([{ ...both, only: ['166'] }]);
      await showChips();
      await fireEvent.press(screen.getByRole('button', { name: 'Remove NJ Transit' }));
      await flush();
      expect(await loadRoutes()).toEqual([{ id: 'r1', from: pabt, to: tenafly }]);
    });

    it('only filters when none of the other carrier’s lines are kept; the ✕ is what takes it off', async () => {
      await save([both]);
      await showChips();
      await fireEvent.press(chip('Coach 20'));
      await flush();
      expect(await loadRoutes()).toEqual([{ ...both, only: ['20'] }]);
      expect(screen.getByText('NJ Transit')).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Remove NJ Transit' })).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: /^\+/ })).toBeNull();

      // Back to All: the other carrier's buses are still there.
      await fireEvent.press(chip('All'));
      await flush();
      expect(await loadRoutes()).toEqual([{ ...both, only: undefined }]);
    });

    it('keeps the other carrier when one of its lines is kept', async () => {
      await save([both]);
      await showChips();
      await fireEvent.press(chip('166'));
      await flush();
      expect(await loadRoutes()).toEqual([{ ...both, only: ['166'] }]);
      expect(screen.getByText('New York → Tenafly · 166')).toBeOnTheScreen();
    });
  });
});
