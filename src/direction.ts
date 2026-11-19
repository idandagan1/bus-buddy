import * as Location from 'expo-location';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { distanceMeters } from './geo';
import type { SavedRoute, Stop } from './types';

// A recent fix is plenty to tell which end of the route the rider is at.
const MAX_AGE_MS = 10 * 60 * 1000;
// Without a location: into the city in the morning, out of it from noon on. "The city" is whichever end of the
// route is nearer Midtown, so it works whichever way round the route was saved.
const EVENING_FROM_HOUR = 12;
const MIDTOWN = { latitude: 40.757, longitude: -73.99 };

type LatLng = { latitude: number; longitude: number };

// Away from whichever end the rider is nearer to; with no fix, by the clock.
export function isRideBack(route: SavedRoute, fix: LatLng | null, now: Date) {
  if (fix) return distanceMeters(fix, route.to) < distanceMeters(fix, route.from);
  const startsInCity = distanceMeters(route.from, MIDTOWN) < distanceMeters(route.to, MIDTOWN);
  const evening = now.getHours() >= EVENING_FROM_HOUR;
  return evening ? !startsInCity : startsInCity;
}

async function currentFix(): Promise<LatLng | null> {
  const { granted } = await Location.getForegroundPermissionsAsync();
  if (!granted) return null;
  const fix =
    (await Location.getLastKnownPositionAsync({ maxAge: MAX_AGE_MS })) ??
    (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
  return fix.coords;
}

// Which way the rider is probably going on a saved route, so at the destination it offers the ride back.
// Only uses location if it's already allowed (never prompts); otherwise goes by the time of day.
export function useDirection(route: SavedRoute): { from: Stop; to: Stop; reversed: boolean } {
  const [reversed, setReversed] = useState(false);

  const refresh = useCallback(() => {
    currentFix()
      .catch(() => null)
      .then((fix) => setReversed(isRideBack(route, fix, new Date())));
  }, [route]);

  useFocusEffect(refresh);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => state === 'active' && refresh());
    return () => sub.remove();
  }, [refresh]);

  return reversed ? { from: route.to, to: route.from, reversed } : { from: route.from, to: route.to, reversed };
}
