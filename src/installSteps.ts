// How to add the web app to the home screen, by phone and browser. Only Android's Chrome can show its own
// install prompt from a button; everywhere else (every iPhone browser included) it's a menu, in a different
// place in each browser. Null on desktops and anything else we have no steps for.
export type InstallGuide = { os: 'ios' | 'android'; steps: string[] };

const KEEP_ROUTES = 'Tap “Add”, and your routes come along';

export function installGuide(ua: string, touchMac = false): InstallGuide | null {
  if (/iPhone|iPad|iPod/.test(ua) || touchMac) {
    if (/CriOS/.test(ua)) {
      return { os: 'ios', steps: ['Tap the Share button ⬆︎ in Chrome’s address bar (top right, or at the bottom if you moved it)', 'Scroll down and choose “Add to Home Screen”', KEEP_ROUTES] };
    }
    if (/FxiOS/.test(ua)) return { os: 'ios', steps: ['Tap the menu ☰ at the bottom right', 'Tap “Share”, then “Add to Home Screen”', KEEP_ROUTES] };
    if (/EdgiOS/.test(ua)) return { os: 'ios', steps: ['Tap the menu ⋯ at the bottom', 'Tap “Share”, then “Add to Home Screen”', KEEP_ROUTES] };
    // In-app browsers (Instagram, Facebook, Gmail…) leave "Safari/" out of their user agent and can't add pages.
    if (!/Safari\//.test(ua)) return { os: 'ios', steps: ['Open this page in Safari first (look for “Open in Safari” in this app’s ⋯ menu)', 'Then tap Share ⬆︎ and choose “Add to Home Screen”'] };
    return { os: 'ios', steps: ['Tap the Share button ⬆︎ (on newer iPhones, tap ⋯ next to the address bar first)', 'Scroll down and choose “Add to Home Screen”', KEEP_ROUTES] };
  }
  if (/Android/.test(ua)) {
    if (/SamsungBrowser/.test(ua)) return { os: 'android', steps: ['Tap the menu ☰ at the bottom right', 'Tap “Add page to”, then “Home screen”'] };
    if (/Firefox\//.test(ua)) return { os: 'android', steps: ['Tap the menu ⋮', 'Tap “Add to Home screen” (it may say “Add app to Home screen”)'] };
    return { os: 'android', steps: ['Tap the menu ⋮ at the top right', 'Tap “Add to Home screen” (it may say “Install app”)', 'Tap “Install” or “Add”'] };
  }
  return null;
}
