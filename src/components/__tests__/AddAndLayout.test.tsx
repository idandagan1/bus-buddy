import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { AppState } from 'react-native';
import { syncTracking } from '@/alarm';
import { loadRoutes } from '@/api';
import AddRoute from '@/app/add';
import RootLayout from '@/app/_layout';
import type { SavedRoute, Stop } from '@/types';
import { trackScreen } from '@/analytics';

jest.mock('react-native-reanimated', () => jest.requireActual('./reanimatedMock'));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-router', () => {
  const { Text: RNText, View } = jest.requireActual('react-native');
  const Stack = ({ children }: { children: unknown }) => <View>{children as never}</View>;
  Stack.Screen = function Screen({ name }: { name: string }) {
    return <RNText>{`screen:${name}`}</RNText>;
  };
  return {
    router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn() },
    useLocalSearchParams: jest.fn(),
    useSegments: jest.fn(() => ['route', '[id]']),
    Stack,
  };
});
jest.mock('expo-router/head', () => () => null);
jest.mock('@/alarm', () => ({ syncTracking: jest.fn() }));
jest.mock('@/install', () => ({}));
jest.mock('@/analytics', () => ({ trackScreen: jest.fn(), track: jest.fn(), routeProps: jest.fn(() => ({})) }));
jest.mock('@/components/OfflineBanner', () => ({ OfflineBanner: () => null }));
jest.mock('@/components/Toast', () => ({ Toast: () => null }));
jest.mock('@/components/Welcome', () => ({ Welcome: () => null }));
// The planner has its own tests; here it shows what it was handed and saves the stops it's told to.
jest.mock('@/components/RoutePlanner', () => {
  const { Pressable, Text: RNText } = jest.requireActual('react-native');
  return {
    RoutePlanner: (p: { initialFrom?: Stop; initialTo?: Stop; saveLabel: string; onSave: (from: Stop, to: Stop) => void }) => {
      const g = globalThis as unknown as { plannerPick: [Stop, Stop] };
      return (
        <>
          <RNText>{`planner from ${p.initialFrom?.name ?? '-'} to ${p.initialTo?.name ?? '-'}`}</RNText>
          <Pressable accessibilityRole="button" onPress={() => p.onSave(...g.plannerPick)}>
            <RNText>{p.saveLabel}</RNText>
          </Pressable>
        </>
      );
    },
  };
});

const stop = (id: string, name: string): Stop => ({ id, name, town: 'Tenafly', state: 'NJ', latitude: 40.9, longitude: -73.9 });
const pabt = stop('c1', 'Port Authority');
const tenafly = stop('c2', 'Tenafly');
const teaneck = stop('c3', 'Teaneck');
const pick = (from: Stop, to: Stop) => {
  (globalThis as unknown as { plannerPick: [Stop, Stop] }).plannerPick = [from, to];
};

const saved: SavedRoute[] = [
  { id: 'r1', from: pabt, to: tenafly, only: ['166X'], also: { from: stop('njt:1', 'PABT'), to: stop('njt:2', 'Tenafly NJT') } },
  { id: 'r2', from: tenafly, to: pabt },
];

beforeEach(async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-11-19T17:00:00Z'));
  await AsyncStorage.clear();
  await AsyncStorage.setItem('savedRoutes', JSON.stringify(saved));
  jest.mocked(router.canGoBack).mockReturnValue(true);
  jest.mocked(useLocalSearchParams).mockReturnValue({});
});

afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
});

const flush = () => act(async () => {
  await jest.advanceTimersByTimeAsync(0);
});

describe('Add route screen', () => {
  it('adds a new route to the end and goes back', async () => {
    pick(teaneck, pabt);
    await render(<AddRoute />);
    expect(screen.getByText('New route')).toBeOnTheScreen();
    expect(screen.getByText('planner from - to -')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Save route' }));
    await flush();
    const routes = await loadRoutes();
    expect(routes).toHaveLength(3);
    expect(routes[2]).toEqual({ id: String(Date.now()), from: teaneck, to: pabt });
    expect(router.back).toHaveBeenCalled();
  });

  it('goes home instead when there is nothing to go back to', async () => {
    jest.mocked(router.canGoBack).mockReturnValue(false);
    pick(teaneck, pabt);
    await render(<AddRoute />);
    await fireEvent.press(screen.getByRole('button', { name: 'Save route' }));
    await flush();
    expect(router.replace).toHaveBeenCalledWith('/');
    expect(router.back).not.toHaveBeenCalled();
  });

  it('opens an edited route with its stops and keeps its lines when the stops stay', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ edit: 'r1' });
    pick(pabt, tenafly);
    await render(<AddRoute />);
    expect(screen.getByText('Edit route')).toBeOnTheScreen();
    await flush();
    expect(screen.getByText('planner from Port Authority to Tenafly')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));
    await flush();
    expect(await loadRoutes()).toEqual(saved);
  });

  it('drops the chosen lines and other carrier when the stops change', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ edit: 'r1' });
    pick(pabt, teaneck);
    await render(<AddRoute />);
    await flush();
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));
    await flush();
    const [first, second] = await loadRoutes();
    expect(first).toEqual({ id: 'r1', from: pabt, to: teaneck });
    expect(second).toEqual(saved[1]);
  });

  it('treats an edit link to a missing route as a new one', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ edit: 'gone' });
    pick(teaneck, pabt);
    await render(<AddRoute />);
    await flush();
    expect(screen.getByText('planner from - to -')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Save route' }));
    await flush();
    expect(await loadRoutes()).toHaveLength(3);
  });

  it('goes back from the header, or home without history', async () => {
    await render(<AddRoute />);
    await fireEvent.press(screen.getByText('‹ Back'));
    expect(router.back).toHaveBeenCalledTimes(1);
    jest.mocked(router.canGoBack).mockReturnValue(false);
    await fireEvent.press(screen.getByText('‹ Back'));
    expect(router.replace).toHaveBeenCalledWith('/');
  });
});

describe('Root layout', () => {
  it('lays out every screen and syncs the alarm on start and on return to the app', async () => {
    jest.mocked(syncTracking).mockRejectedValue(new Error('no permission'));
    let onChange: (state: string) => void = () => {};
    const remove = jest.fn();
    const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, fn) => {
      onChange = fn as (state: string) => void;
      return { remove } as never;
    });

    const { unmount } = await render(<RootLayout />);
    for (const name of ['index', 'add', 'route/[id]', 'settings', 'map', 'alarm']) {
      expect(screen.getByText(`screen:${name}`)).toBeOnTheScreen();
    }
    expect(syncTracking).toHaveBeenCalledTimes(1);
    // Screens are counted by route, not by each saved route's id.
    expect(trackScreen).toHaveBeenCalledWith('/route/[id]');

    onChange('background');
    expect(syncTracking).toHaveBeenCalledTimes(1);
    onChange('active');
    expect(syncTracking).toHaveBeenCalledTimes(2);
    await flush();

    await unmount();
    expect(remove).toHaveBeenCalled();
    spy.mockRestore();
  });
});
