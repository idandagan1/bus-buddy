// Safe areas on the web come from the browser's env(safe-area-inset-*), measured with a hidden probe.
import { act, renderHook } from '@testing-library/react-native';

let mockLibraryInsets = { top: 0, right: 0, bottom: 0, left: 0 };
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => mockLibraryInsets }));

// A small browser (the React Native test setup rules out jsdom): the probe's padding is what the phone reports.
let device = { top: 0, right: 0, bottom: 0, left: 0 };
const listeners = new Map<string, () => void>();
const g = globalThis as Record<string, unknown>;
g.document = {
  createElement: () => ({ style: {}, remove: jest.fn() }),
  body: { appendChild: jest.fn() },
};
g.getComputedStyle = () => ({
  paddingTop: `${device.top}px`,
  paddingRight: `${device.right}px`,
  paddingBottom: `${device.bottom}px`,
  paddingLeft: `${device.left}px`,
});
g.window = {
  addEventListener: (type: string, fn: () => void) => listeners.set(type, fn),
  removeEventListener: (type: string) => listeners.delete(type),
};
g.requestAnimationFrame = (fn: () => void) => setTimeout(fn, 16);
g.cancelAnimationFrame = (id: ReturnType<typeof setTimeout>) => clearTimeout(id);

// eslint-disable-next-line @typescript-eslint/no-require-imports -- after the fake browser is in place
const { useInsets } = require('./insets.web') as typeof import('./insets.web');

beforeEach(() => {
  jest.useFakeTimers();
  device = { top: 0, right: 0, bottom: 0, left: 0 };
  mockLibraryInsets = { top: 0, right: 0, bottom: 0, left: 0 };
});

afterEach(() => jest.useRealTimers());

it('uses the status bar height the browser reports, which the safe-area library misses', async () => {
  device = { top: 59, right: 0, bottom: 34, left: 0 };
  const { result } = await renderHook(() => useInsets());
  expect(result.current).toEqual({ top: 59, right: 0, bottom: 34, left: 0 });
});

it('picks up the status bar once the page’s viewport settings apply', async () => {
  const { result } = await renderHook(() => useInsets());
  expect(result.current.top).toBe(0);
  device = { top: 47, right: 0, bottom: 34, left: 0 };
  await act(() => jest.advanceTimersByTime(500));
  expect(result.current).toEqual({ top: 47, right: 0, bottom: 34, left: 0 });
});

it('measures again when the phone rotates', async () => {
  device = { top: 59, right: 0, bottom: 34, left: 0 };
  const { result } = await renderHook(() => useInsets());
  device = { top: 0, right: 59, bottom: 21, left: 59 };
  await act(() => listeners.get('orientationchange')!());
  expect(result.current).toEqual({ top: 0, right: 59, bottom: 21, left: 59 });
});

it('keeps the library’s value where it reports more', async () => {
  mockLibraryInsets = { top: 24, right: 0, bottom: 0, left: 0 };
  const { result } = await renderHook(() => useInsets());
  expect(result.current.top).toBe(24);
});

it('keeps the same answer while nothing changes, and stops listening when unused', async () => {
  device = { top: 59, right: 0, bottom: 34, left: 0 };
  const { result, unmount } = await renderHook(() => useInsets());
  const first = result.current;
  await act(() => listeners.get('resize')!());
  expect(result.current).toEqual(first);
  await unmount();
  expect(listeners.size).toBe(0);
});
