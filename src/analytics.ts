// Usage and errors, reported to PostHog (US cloud). Only the real app reports — not dev builds, tests or a copy
// served from a laptop — and nothing personal: stop names and towns, never the rider's location.
import Constants from 'expo-constants';
import PostHog from 'posthog-react-native';
import { Platform } from 'react-native';
import type { SavedRoute, Stop } from './types';

// The project token only sends events (it can't read anything), so it's fine in the app.
const KEY = 'phc_mBbbM88LQgjCBWDmtdM6u5ufauedsUMZHjzg4oiburKJ';
const HOST = 'https://us.i.posthog.com';

type Props = Record<string, string | number | boolean | string[] | null>;

function isLive() {
  if (__DEV__ || process.env.NODE_ENV === 'test') return false;
  if (Platform.OS !== 'web') return true;
  // Pages are also rendered on the server, where there's no one to count.
  return typeof window !== 'undefined' && window.location.hostname.endsWith('.expo.app');
}

let client: PostHog | null | undefined;
function posthog() {
  if (client === undefined) {
    client = isLive()
      ? new PostHog(KEY, {
          host: HOST,
          captureAppLifecycleEvents: true,
          errorTracking: { autocapture: { uncaughtExceptions: true, unhandledRejections: true } },
        })
      : null;
    client?.register({ app_version: Constants.expoConfig?.version ?? null, platform: Platform.OS });
  }
  return client;
}

export function track(event: string, props?: Props) {
  posthog()?.capture(event, props);
}

export function trackScreen(name: string) {
  posthog()?.screen(name);
}

const carrierName = (s: Stop) => (s.carrier === 'NJT' ? 'NJ Transit' : 'Coach USA');

export const routeProps = (r: SavedRoute): Props => ({
  carrier: carrierName(r.from),
  from: r.from.name,
  from_town: r.from.town || null,
  to: r.to.name,
  to_town: r.to.town || null,
  with_carrier: r.also ? carrierName(r.also.from) : null,
  lines: r.only ?? null,
});

// What changed on a saved route from its card or schedule: the other carrier added or taken off, or the lines
// shown.
export function trackRouteChange(prev: SavedRoute, next: SavedRoute, screen: 'home' | 'schedule') {
  const props = { ...routeProps(next), screen };
  if (!prev.also && next.also) track('carrier_added', props);
  else if (prev.also && !next.also) track('carrier_removed', { ...props, removed: carrierName(prev.also.from) });
  else if ((prev.only ?? []).join() !== (next.only ?? []).join()) track('lines_filtered', props);
}
