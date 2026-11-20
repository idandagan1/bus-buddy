import type AsyncStorageType from '@react-native-async-storage/async-storage';
import type * as RNTL from '@testing-library/react-native/pure';
import type * as FirstRunModule from './firstRun';

// firstRun keeps its state for the app's lifetime, so each test starts from fresh modules (the pure
// testing library, since the main entry registers its own hooks on import).
let AsyncStorage: typeof AsyncStorageType;
let firstRun: typeof FirstRunModule;
let renderHook: typeof RNTL.renderHook;
let act: typeof RNTL.act;
let cleanup: typeof RNTL.cleanup;

beforeEach(() => {
  jest.resetModules();
  AsyncStorage = jest.requireActual('@react-native-async-storage/async-storage');
  ({ renderHook, act, cleanup } = jest.requireActual('@testing-library/react-native/pure'));
  firstRun = jest.requireActual('./firstRun');
});

afterEach(() => cleanup());

const mount = async () => {
  const hook = await renderHook(() => firstRun.useFirstRun());
  await act(async () => {});
  return hook;
};

describe('useFirstRun', () => {
  it('shows the welcome and the nudge on a fresh install', async () => {
    const { result } = await mount();
    expect(result.current).toEqual({ welcome: true, nudge: true });
  });

  it('is null until storage has been read', async () => {
    (AsyncStorage.multiGet as jest.Mock).mockReturnValueOnce(new Promise(() => {}));
    const { result } = await mount();
    expect(result.current).toBeNull();
  });

  it('shows only what has not been seen yet', async () => {
    await AsyncStorage.setItem('welcomed', '1');
    const { result } = await mount();
    expect(result.current).toEqual({ welcome: false, nudge: true });
  });

  it('skips both for people who already saved routes, and remembers that', async () => {
    await AsyncStorage.setItem('savedRoutes', JSON.stringify([{ id: 'r1' }]));
    const { result } = await mount();
    expect(result.current).toEqual({ welcome: false, nudge: false });
    expect(await AsyncStorage.getItem('welcomed')).toBe('1');
    expect(await AsyncStorage.getItem('fromNudged')).toBe('1');
  });

  it('treats an empty route list as no routes', async () => {
    await AsyncStorage.setItem('savedRoutes', '[]');
    const { result } = await mount();
    expect(result.current).toEqual({ welcome: true, nudge: true });
  });

  it('shows neither when storage cannot be read', async () => {
    (AsyncStorage.multiGet as jest.Mock).mockRejectedValueOnce(new Error('locked'));
    const { result } = await mount();
    expect(result.current).toEqual({ welcome: false, nudge: false });
  });

  it('reads storage once for every screen using it', async () => {
    await mount();
    const second = await mount();
    expect(second.result.current).toEqual({ welcome: true, nudge: true });
    expect(AsyncStorage.multiGet).toHaveBeenCalledTimes(1);
  });
});

describe('finishing a first-run moment', () => {
  it('hides the welcome everywhere and remembers it', async () => {
    const a = await mount();
    const b = await mount();
    await act(async () => firstRun.finishWelcome());
    expect(a.result.current).toEqual({ welcome: false, nudge: true });
    expect(b.result.current).toEqual({ welcome: false, nudge: true });
    expect(await AsyncStorage.getItem('welcomed')).toBe('1');
  });

  it('hides the nudge and remembers it', async () => {
    const { result } = await mount();
    await act(async () => firstRun.finishNudge());
    expect(result.current).toEqual({ welcome: true, nudge: false });
    expect(await AsyncStorage.getItem('fromNudged')).toBe('1');
  });

  it('stops updating a screen that is gone', async () => {
    const { result, unmount } = await mount();
    await unmount();
    await act(async () => firstRun.finishWelcome());
    expect(result.current).toEqual({ welcome: true, nudge: true });
  });

  it('remembers it even when finished before storage was read', async () => {
    firstRun.finishWelcome();
    await act(async () => {});
    expect(await AsyncStorage.getItem('welcomed')).toBe('1');
    const { result } = await mount();
    expect(result.current).toEqual({ welcome: false, nudge: true });
  });

  it('ignores a failed save', async () => {
    const { result } = await mount();
    (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
    await act(async () => firstRun.finishNudge());
    expect(result.current).toEqual({ welcome: true, nudge: false });
  });
});
