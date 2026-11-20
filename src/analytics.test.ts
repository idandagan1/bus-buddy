// What gets reported to PostHog, and when nothing is.
import type { SavedRoute, Stop } from './types';

const mockCapture = jest.fn();
const mockScreen = jest.fn();
const mockRegister = jest.fn();
const mockPostHog = jest.fn(() => ({ capture: mockCapture, screen: mockScreen, register: mockRegister }));
jest.mock('posthog-react-native', () => ({ __esModule: true, default: mockPostHog }));
const [PostHog, capture, screen, register] = [mockPostHog, mockCapture, mockScreen, mockRegister];

const stop = (id: string, extra: Partial<Stop> = {}): Stop => ({ id, name: id, town: '', state: 'NJ', latitude: 0, longitude: 0, ...extra });
const coach: SavedRoute = { id: 'r', from: stop('Hillside Ave & Highwood Ave', { town: 'Tenafly' }), to: stop('Port Authority Bus Terminal', { town: 'New York' }) };
const njt = { from: stop('Hillside Ave at Highwood Ave', { carrier: 'NJT' }), to: stop('Port Authority', { carrier: 'NJT', routes: ['166'] }) };

let analytics: typeof import('./analytics');
const env = process.env.NODE_ENV;

// A fresh module, as in the real app (not a test or dev build) unless told otherwise.
function load({ live = true, os = 'ios', hostname = 'bus-buddy.expo.app' } = {}) {
  jest.resetModules();
  PostHog.mockClear();
  capture.mockClear();
  screen.mockClear();
  register.mockClear();
  process.env.NODE_ENV = live ? 'production' : 'test';
  (globalThis as { __DEV__?: boolean }).__DEV__ = !live;
  jest.doMock('react-native', () => ({ Platform: { OS: os } }));
  jest.doMock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '1.2.3' } } }));
  Object.defineProperty(globalThis, 'window', { value: os === 'web' && hostname ? { location: { hostname } } : undefined, configurable: true });
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- a fresh copy per case
  analytics = require('./analytics');
}

afterEach(() => {
  process.env.NODE_ENV = env;
  (globalThis as { __DEV__?: boolean }).__DEV__ = true;
  jest.dontMock('react-native');
  jest.dontMock('expo-constants');
});

describe('when it reports', () => {
  it('reports from the phone app, to the US cloud, with crashes, version and platform', () => {
    load();
    analytics.track('route_added', { carrier: 'Coach USA' });
    expect(PostHog).toHaveBeenCalledWith(expect.stringMatching(/^phc_/), expect.objectContaining({ host: 'https://us.i.posthog.com', errorTracking: { autocapture: { uncaughtExceptions: true, unhandledRejections: true } } }));
    expect(register).toHaveBeenCalledWith({ app_version: '1.2.3', platform: 'ios' });
    expect(capture).toHaveBeenCalledWith('route_added', { carrier: 'Coach USA' });
  });

  it('starts one client for every event', () => {
    load();
    analytics.track('a');
    analytics.trackScreen('/');
    analytics.track('b');
    expect(PostHog).toHaveBeenCalledTimes(1);
    expect(screen).toHaveBeenCalledWith('/');
  });

  it('reports from the published website', () => {
    load({ os: 'web', hostname: 'bus-buddy--abc123.expo.app' });
    analytics.track('x');
    expect(capture).toHaveBeenCalledWith('x', undefined);
  });

  it('stays quiet in tests, on a laptop copy and while the server renders the page', () => {
    for (const opts of [{ live: false }, { os: 'web', hostname: 'localhost' }, { os: 'web', hostname: '10.26.102.192' }, { os: 'web', hostname: '' }]) {
      load(opts);
      analytics.track('x');
      analytics.trackScreen('/');
      expect(PostHog).not.toHaveBeenCalled();
    }
  });
});

describe('routeProps', () => {
  it('names the carrier, stops and towns, and nothing about the rider', () => {
    load();
    expect(analytics.routeProps(coach)).toEqual({
      carrier: 'Coach USA',
      from: 'Hillside Ave & Highwood Ave',
      from_town: 'Tenafly',
      to: 'Port Authority Bus Terminal',
      to_town: 'New York',
      with_carrier: null,
      lines: null,
    });
  });

  it('includes the other carrier and the lines chosen, and leaves blank towns out', () => {
    load();
    expect(analytics.routeProps({ id: 'r', ...njt, also: { from: coach.from, to: coach.to }, only: ['166X'] })).toMatchObject({
      carrier: 'NJ Transit',
      from_town: null,
      with_carrier: 'Coach USA',
      lines: ['166X'],
    });
  });
});

describe('trackRouteChange', () => {
  beforeEach(() => load());

  it('reports the other carrier added', () => {
    analytics.trackRouteChange(coach, { ...coach, also: njt }, 'home');
    expect(capture).toHaveBeenCalledWith('carrier_added', expect.objectContaining({ with_carrier: 'NJ Transit', screen: 'home' }));
  });

  it('reports the other carrier taken off, naming which', () => {
    analytics.trackRouteChange({ ...coach, also: njt, only: ['166'] }, coach, 'schedule');
    expect(capture).toHaveBeenCalledWith('carrier_removed', expect.objectContaining({ removed: 'NJ Transit', with_carrier: null, screen: 'schedule' }));
  });

  it('reports a change of lines, including back to all', () => {
    analytics.trackRouteChange(coach, { ...coach, only: ['166X'] }, 'home');
    analytics.trackRouteChange({ ...coach, only: ['166X'] }, coach, 'home');
    expect(capture.mock.calls.map(([event, props]) => [event, props.lines])).toEqual([
      ['lines_filtered', ['166X']],
      ['lines_filtered', null],
    ]);
  });

  it('reports nothing when nothing changed', () => {
    analytics.trackRouteChange({ ...coach, only: ['166X'] }, { ...coach, only: ['166X'] }, 'home');
    analytics.trackRouteChange(coach, { ...coach, only: [] }, 'home');
    expect(capture).not.toHaveBeenCalled();
  });
});
