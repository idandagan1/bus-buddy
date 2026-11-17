import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

// First-run moments, each shown once: the welcome scene, then a nudge toward the From field.
// People who already saved routes skip both: they know the app.
const WELCOMED = 'welcomed';
const FROM_NUDGED = 'fromNudged';

export type FirstRun = { welcome: boolean; nudge: boolean };

let state: FirstRun | null = null;
const listeners = new Set<(s: FirstRun) => void>();

function set(next: FirstRun) {
  state = next;
  listeners.forEach((l) => l(next));
}

let loading: Promise<void> | null = null;
function load() {
  loading ??= AsyncStorage.multiGet([WELCOMED, FROM_NUDGED, 'savedRoutes'])
    .then(([[, welcomed], [, nudged], [, routes]]) => {
      if (routes && routes !== '[]') {
        AsyncStorage.multiSet([[WELCOMED, '1'], [FROM_NUDGED, '1']]).catch(() => {});
        return set({ welcome: false, nudge: false });
      }
      set({ welcome: !welcomed, nudge: !nudged });
    })
    .catch(() => set({ welcome: false, nudge: false }));
  return loading;
}

// null until storage has been read.
export function useFirstRun() {
  const [s, setS] = useState(state);
  useEffect(() => {
    listeners.add(setS);
    load();
    return () => void listeners.delete(setS);
  }, []);
  return s;
}

export function finishWelcome() {
  AsyncStorage.setItem(WELCOMED, '1').catch(() => {});
  if (state) set({ ...state, welcome: false });
}

export function finishNudge() {
  AsyncStorage.setItem(FROM_NUDGED, '1').catch(() => {});
  if (state) set({ ...state, nudge: false });
}
