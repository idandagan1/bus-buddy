// "Add to Home Screen" for the web app. Android's Chrome lets a page show the install prompt itself
// (beforeinstallprompt); everywhere else we explain the steps for that phone and browser (installSteps.ts).
// On the iPhone the home-screen app gets storage of its own, apart from Safari's, so saved routes travel in
// the URL it's added with and are copied in on its first launch.
import { useSyncExternalStore } from 'react';
import { installGuide } from './installSteps';
import { track } from './analytics';

export type InstallMode = 'prompt' | 'steps' | null;

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

const DISMISSED = 'installDismissed';
const ROUTES = 'savedRoutes';
const HANDOFF_PARAM = 'routes';
// The home-screen app opens at that URL every time; only its first launch copies the routes, so ones removed
// later don't come back.
const HANDED_OFF = 'routesHandedOff';

const browser = typeof window !== 'undefined';
const guide = browser ? installGuide(navigator.userAgent, navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) : null;
const ios = guide?.os === 'ios';
const standalone = () =>
  browser && (window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

function storage(key: string, value?: string) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch {}
  return null;
}

let deferred: InstallPromptEvent | null = null;
let installed = false;
let dismissed = browser && !!storage(DISMISSED);
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((l) => l());

if (browser) {
  // Before anything reads storage: a home-screen launch brings the routes saved in Safari.
  const handoff = new URLSearchParams(location.search).get(HANDOFF_PARAM);
  if (handoff && !storage(HANDED_OFF)) {
    storage(HANDED_OFF, '1');
    const saved = storage(ROUTES);
    if (!saved || saved === '[]') {
      try {
        if (Array.isArray(JSON.parse(handoff))) {
          storage(ROUTES, handoff);
          storage('welcomed', '1');
          storage('fromNudged', '1');
        }
      } catch {}
    }
  }
  if (handoff) history.replaceState(null, '', location.pathname);

  const head = (tag: string, attrs: Record<string, string>) => {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    document.head.appendChild(el);
  };
  // The icon and home-screen tags are in app/_layout.tsx. The manifest is added here, and not on iPhones: they add
  // whatever URL is open, which carries the routes, and a manifest start_url would replace it.
  if (!ios) head('link', { rel: 'manifest', href: '/manifest.webmanifest' });

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    changed();
  });
  window.addEventListener('appinstalled', () => {
    track('app_installed');
    installed = true;
    deferred = null;
    changed();
  });
}

// Puts the saved routes in the address bar, so the home-screen app the iPhone makes from it starts with them.
export function handoffRoutesForIos() {
  const saved = storage(ROUTES);
  if (!ios || !saved || saved === '[]') return;
  history.replaceState(null, '', `${location.pathname}?${HANDOFF_PARAM}=${encodeURIComponent(saved)}`);
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
// Chrome offers its prompt only once it judges the visitor engaged, so until then Android gets the menu steps too.
const currentMode = (): InstallMode => (dismissed || installed || standalone() ? null : deferred ? 'prompt' : guide ? 'steps' : null);

export function useInstall() {
  // The server can't know the browser, so the page renders without the card until it's hydrated.
  const mode = useSyncExternalStore(subscribe, currentMode, () => null);
  return {
    mode,
    steps: guide?.steps ?? [],
    install: async () => {
      if (!deferred) return;
      await deferred.prompt();
      if ((await deferred.userChoice).outcome === 'accepted') installed = true;
      deferred = null;
      changed();
    },
    dismiss: () => {
      storage(DISMISSED, '1');
      dismissed = true;
      changed();
    },
  };
}
