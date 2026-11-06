import * as Location from 'expo-location';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { distanceMeters } from './geo';
import type { SavedRoute, Stop } from './types';

// A recent fix is plenty to tell which end of the route the rider is at.
const MAX_AGE_MS = 10 * 60 * 1000;

// Which way the rider is probably going on a saved route: away from whichever end they're nearer to,
// so at the destination it offers the ride back. Only uses location if it's already allowed; never prompts.
export function useDirection(route: SavedRoute): { from: Stop; to: Stop; reversed: boolean } {
  const [reversed, setReversed] = useState(false);

  const refresh = useCallback(() => {
    (async () => {
      const { granted } = await Location.getForegroundPermissionsAsync();
      if (!granted) return;
      const fix =
        (await Location.getLastKnownPositionAsync({ maxAge: MAX_AGE_MS })) ??
        (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
      setReversed(distanceMeters(fix.coords, route.to) < distanceMeters(fix.coords, route.from));
    })().catch(() => {});
  }, [route.from, route.to]);

  useFocusEffect(refresh);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => state === 'active' && refresh());
    return () => sub.remove();
  }, [refresh]);

  return reversed ? { from: route.to, to: route.from, reversed } : { from: route.from, to: route.to, reversed };
}
