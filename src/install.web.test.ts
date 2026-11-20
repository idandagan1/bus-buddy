import type * as RNTL from '@testing-library/react-native/pure';
import type * as InstallModule from './install.web';

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  desktop: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
};

const routes = JSON.stringify([{ id: 'r1', from: { id: 'a' }, to: { id: 'b' } }]);

let renderHook: typeof RNTL.renderHook;
let act: typeof RNTL.act;
let cleanup: typeof RNTL.cleanup;
let standalone = false;

// A small browser for the module to run in (the React Native test setup rules out jsdom).
const g = globalThis as Record<string, unknown>;
const store = new Map<string, string>();
const localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  clear: () => store.clear(),
  get length() {
    return store.size;
  },
};
const location = { pathname: '/', search: '' };
const history = {
  replaceState: (_state: unknown, _title: string, url: string) => {
    const u = new URL(url, 'https://bus.example');
    location.pathname = u.pathname;
    location.search = u.search;
  },
};
const head: { rel: string | null; href: string | null }[] = [];
const document = {
  head: { appendChild: (el: { attrs: Record<string, string> }) => head.push({ rel: el.attrs.rel ?? null, href: el.attrs.href ?? null }) },
  createElement: () => {
    const attrs: Record<string, string> = {};
    return { attrs, setAttribute: (k: string, v: string) => (attrs[k] = v) };
  },
};
let target = new EventTarget();
const manifest = () => head.find((l) => l.rel === 'manifest')?.href ?? null;

// The module does its work on load, so each test sets up the page and then loads it fresh.
function load({ url = '/', ua = UA.android }: { url?: string; ua?: string } = {}): typeof InstallModule {
  history.replaceState(null, '', url);
  Object.assign(g, { localStorage, location, history, document });
  Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true });
  Object.defineProperty(navigator, 'platform', { value: '', configurable: true });
  target = new EventTarget();
  g.addEventListener = target.addEventListener.bind(target);
  g.matchMedia = () => ({ matches: standalone });
  jest.resetModules();
  ({ renderHook, act, cleanup } = jest.requireActual('@testing-library/react-native/pure'));
  return jest.requireActual('./install.web');
}

const installPrompt = (outcome: 'accepted' | 'dismissed') => {
  const e = new Event('beforeinstallprompt', { cancelable: true });
  return Object.assign(e, { prompt: jest.fn(async () => {}), userChoice: Promise.resolve({ outcome }) });
};

const dispatch = (e: Event) => target.dispatchEvent(e);

beforeEach(() => {
  store.clear();
  head.length = 0;
  standalone = false;
});

afterEach(() => cleanup?.());

describe('route handoff to the home-screen app', () => {
  it('copies the routes in on first launch and skips the first-run moments', () => {
    load({ url: `/?routes=${encodeURIComponent(routes)}` });
    expect(localStorage.getItem('savedRoutes')).toBe(routes);
    expect(localStorage.getItem('welcomed')).toBe('1');
    expect(localStorage.getItem('fromNudged')).toBe('1');
    expect(localStorage.getItem('routesHandedOff')).toBe('1');
  });

  it('takes the routes out of the address bar', () => {
    load({ url: `/route/r1?routes=${encodeURIComponent(routes)}` });
    expect(location.pathname).toBe('/route/r1');
    expect(location.search).toBe('');
  });

  it('copies them only once, so removed routes don’t come back', () => {
    load({ url: `/?routes=${encodeURIComponent(routes)}` });
    localStorage.setItem('savedRoutes', '[]');
    load({ url: `/?routes=${encodeURIComponent(routes)}` });
    expect(localStorage.getItem('savedRoutes')).toBe('[]');
  });

  it('never replaces routes already saved', () => {
    localStorage.setItem('savedRoutes', '[{"id":"mine"}]');
    load({ url: `/?routes=${encodeURIComponent(routes)}` });
    expect(localStorage.getItem('savedRoutes')).toBe('[{"id":"mine"}]');
    expect(localStorage.getItem('welcomed')).toBeNull();
  });

  it('fills an empty route list', () => {
    localStorage.setItem('savedRoutes', '[]');
    load({ url: `/?routes=${encodeURIComponent(routes)}` });
    expect(localStorage.getItem('savedRoutes')).toBe(routes);
  });

  it.each([
    ['malformed JSON', '[{"id":'],
    ['an object', '{"id":"r1"}'],
    ['a string', '"r1"'],
  ])('ignores %s, still cleaning the address bar', (_, value) => {
    expect(() => load({ url: `/?routes=${encodeURIComponent(value)}` })).not.toThrow();
    expect(localStorage.getItem('savedRoutes')).toBeNull();
    expect(localStorage.getItem('welcomed')).toBeNull();
    expect(location.search).toBe('');
  });

  it('does nothing without the parameter', () => {
    load({ url: '/route/r1?tab=map' });
    expect(localStorage.length).toBe(0);
    expect(location.search).toBe('?tab=map');
  });

  it('ignores an empty parameter', () => {
    load({ url: '/?routes=' });
    expect(localStorage.getItem('routesHandedOff')).toBeNull();
  });

  it('loads when storage is blocked', () => {
    const blocked = () => {
      throw new Error('SecurityError');
    };
    const getItem = jest.spyOn(localStorage, 'getItem').mockImplementation(blocked);
    const setItem = jest.spyOn(localStorage, 'setItem').mockImplementation(blocked);
    expect(() => load({ url: `/?routes=${encodeURIComponent(routes)}` })).not.toThrow();
    getItem.mockRestore();
    setItem.mockRestore();
  });
});

describe('handoffRoutesForIos', () => {
  it('puts the saved routes in the address bar on an iPhone', () => {
    localStorage.setItem('savedRoutes', routes);
    const install = load({ url: '/route/r1', ua: UA.iphone });
    install.handoffRoutesForIos();
    expect(location.pathname).toBe('/route/r1');
    expect(new URLSearchParams(location.search).get('routes')).toBe(routes);
  });

  it('leaves the address alone with no routes, or off an iPhone', () => {
    localStorage.setItem('savedRoutes', '[]');
    load({ ua: UA.iphone }).handoffRoutesForIos();
    expect(location.search).toBe('');
    localStorage.setItem('savedRoutes', routes);
    load({ ua: UA.android }).handoffRoutesForIos();
    expect(location.search).toBe('');
  });
});

describe('manifest', () => {
  it('is linked everywhere but iPhones', () => {
    load({ ua: UA.android });
    expect(manifest()).toBe('/manifest.webmanifest');
    head.length = 0;
    load({ ua: UA.iphone });
    expect(manifest()).toBeNull();
  });
});

describe('useInstall', () => {
  it('shows the steps until Chrome offers its prompt, then the prompt', async () => {
    const install = load({ ua: UA.android });
    const { result } = await renderHook(() => install.useInstall());
    expect(result.current.mode).toBe('steps');
    expect(result.current.steps.length).toBeGreaterThan(0);
    const e = installPrompt('accepted');
    await act(async () => void dispatch(e));
    expect(e.defaultPrevented).toBe(true);
    expect(result.current.mode).toBe('prompt');
  });

  it('hides the card once installed through the prompt', async () => {
    const install = load({ ua: UA.android });
    const { result } = await renderHook(() => install.useInstall());
    const e = installPrompt('accepted');
    await act(async () => void dispatch(e));
    await act(() => result.current.install());
    expect(e.prompt).toHaveBeenCalled();
    expect(result.current.mode).toBeNull();
  });

  it('goes back to the steps when the prompt is turned down, since Chrome won’t offer it again', async () => {
    const install = load({ ua: UA.android });
    const { result } = await renderHook(() => install.useInstall());
    await act(async () => void dispatch(installPrompt('dismissed')));
    await act(() => result.current.install());
    expect(result.current.mode).toBe('steps');
  });

  it('does nothing when install is tapped without a prompt', async () => {
    const install = load({ ua: UA.android });
    const { result } = await renderHook(() => install.useInstall());
    await act(() => result.current.install());
    expect(result.current.mode).toBe('steps');
  });

  it('hides the card when installed from the browser menu', async () => {
    const install = load({ ua: UA.android });
    const { result } = await renderHook(() => install.useInstall());
    await act(async () => void dispatch(new Event('appinstalled')));
    expect(result.current.mode).toBeNull();
  });

  it('remembers a dismissal', async () => {
    let install = load({ ua: UA.iphone });
    const first = await renderHook(() => install.useInstall());
    await act(async () => first.result.current.dismiss());
    expect(first.result.current.mode).toBeNull();
    cleanup();
    install = load({ ua: UA.iphone });
    const { result } = await renderHook(() => install.useInstall());
    expect(result.current.mode).toBeNull();
  });

  it('shows nothing inside the home-screen app or on a desktop', async () => {
    standalone = true;
    let install = load({ ua: UA.iphone });
    expect((await renderHook(() => install.useInstall())).result.current.mode).toBeNull();
    standalone = false;
    install = load({ ua: UA.desktop });
    const { result } = await renderHook(() => install.useInstall());
    expect(result.current).toMatchObject({ mode: null, steps: [] });
  });
});
