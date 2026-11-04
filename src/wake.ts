import { router } from 'expo-router';
import { Alert } from 'react-native';
import { arm, requestPermissions } from '@/alarm';
import type { LiveSummary } from '@/live';
import { loadSettings } from '@/settings';
import type { Trip } from '@/types';

// Arms the wake-up alarm before one of the trip's stops (the last one by default),
// with a time-based backup a few minutes before the bus is due there.
export async function wakeBefore(trip: Trip, live: LiveSummary | null, stopIndex = trip.stops.length - 1) {
  const error = await requestPermissions();
  if (error) return Alert.alert('Permission needed', error);
  const stop = trip.stops[stopIndex];
  const { radiusM, backupMin } = await loadSettings();
  // Shift the stop's scheduled time by the live arrival delay so a late bus doesn't ring the backup too early.
  const delayMs = (live?.arrivalDelayMin ?? 0) * 60000;
  const dueAt = new Date(new Date(stop.time).getTime() + delayMs);
  const path = trip.stops.slice(0, stopIndex + 1).map(({ latitude, longitude }) => ({ latitude, longitude }));
  await arm({ id: trip.id, name: stop.name, latitude: stop.latitude, longitude: stop.longitude, path }, { radius: radiusM, backupMin }, dueAt);
  router.push('/alarm');
}
