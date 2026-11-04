import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StopMap } from '@/components/StopMap';
import { formatTime, loadRoutes, useNow, useTrips } from '@/api';
import { geocode } from '@/geocode';
import { distanceMeters } from '@/geo';
import { statusKey, summarize, useTripStatuses } from '@/live';
import type { SavedRoute, Stop, Trip } from '@/types';
import { colors, gradient, PressableScale, shadow } from '@/ui';
import { wakeBefore } from '@/wake';

type LatLng = { latitude: number; longitude: number };

// Streets rarely run straight to the door, so pad the straight-line distance a little. ~80 m per minute on foot.
const WALK_DETOUR = 1.3;
const WALK_M_PER_MIN = 80;

// Trip map: stops, the rider, the live bus, and "which stop is closest to where I'm going?".
export default function MapScreen() {
  const { route: routeId, reversed, trip: tripId } = useLocalSearchParams<{ route: string; reversed?: string; trip: string }>();
  const [route, setRoute] = useState<SavedRoute | null>(null);

  useEffect(() => {
    loadRoutes().then((routes) => setRoute(routes.find((r) => r.id === routeId) ?? null));
  }, [routeId]);

  if (Platform.OS === 'android') return <Text style={styles.unsupported}>The map is available on iPhone and the website.</Text>;
  if (!route) return <Loading />;
  const flip = reversed === '1';
  return <TripMap from={flip ? route.to : route.from} to={flip ? route.from : route.to} tripId={tripId} />;
}

function Loading() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

function TripMap({ from, to, tripId }: { from: Stop; to: Stop; tripId: string }) {
  const { trips } = useTrips(from, to);
  const trip = trips?.find((t) => t.id === tripId);
  if (!trip) return <Loading />;
  return <TripMapView trip={trip} />;
}

function TripMapView({ trip }: { trip: Trip }) {
  const insets = useSafeAreaInsets();
  const now = useNow();
  const status = useTripStatuses([trip], now)[statusKey(trip)];
  const live = summarize(status);
  const bus = status?.position ?? null;

  const last = trip.stops.length - 1;
  const [selected, setSelected] = useState(last);
  const [query, setQuery] = useState('');
  const [place, setPlace] = useState<{ name: string; coords: LatLng } | null>(null);
  const [focus, setFocus] = useState<LatLng[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const stop = trip.stops[selected];
  const walkMin = place ? Math.max(1, Math.round((distanceMeters(stop, place.coords) * WALK_DETOUR) / WALK_M_PER_MIN)) : null;

  async function search() {
    const name = query.trim();
    if (!name) return;
    setSearching(true);
    setNotFound(false);
    const coords = await geocode(name);
    setSearching(false);
    if (!coords) return setNotFound(true);
    const closest = trip.stops.reduce((best, s, i) => (distanceMeters(s, coords) < distanceMeters(trip.stops[best], coords) ? i : best), 0);
    setPlace({ name, coords });
    setSelected(closest);
    setFocus([trip.stops[closest], coords]);
  }

  return (
    <View style={styles.fill}>
      <StopMap
        stops={trip.stops}
        selected={selected}
        place={place}
        bus={bus}
        busTitle={`Your bus${live ? ` · ${live.text}` : ''}`}
        focus={focus}
        onSelectStop={setSelected}
      />

      <PressableScale onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={[styles.back, shadow, { top: insets.top + 8 }]}>
        <Text style={styles.backText}>‹ Back</Text>
      </PressableScale>

      <View style={[styles.sheet, shadow, { paddingBottom: insets.bottom + 16 }]}>
        <TextInput
          style={styles.input}
          placeholder="Where are you going? (address or place)"
          placeholderTextColor={colors.muted}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={search}
          returnKeyType="search"
          autoCorrect={false}
        />
        {searching && <Text style={styles.muted}>Looking it up…</Text>}
        {notFound && <Text style={styles.muted}>Couldn’t find that place. Try adding the town, e.g. “Main St, Tenafly NJ”.</Text>}

        <View style={styles.result}>
          <Text style={styles.resultLabel}>{place ? 'Closest stop' : 'Get off at'}</Text>
          <Text style={styles.resultName} numberOfLines={2}>{stop.name}</Text>
          <Text style={styles.muted}>
            Bus due {formatTime(stop.time)}
            {walkMin != null ? ` · ≈ ${walkMin} min walk to ${place!.name}` : ''}
          </Text>
          {!place && <Text style={styles.hint}>Search a place, or tap a stop on the map.</Text>}
        </View>

        {Platform.OS === 'ios' && selected > 0 && new Date(trip.arrival).getTime() > now && (
          <PressableScale onPress={() => wakeBefore(trip, live, selected)}>
            <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.wake}>
              <Text style={styles.wakeText}>⏰ Wake me before this stop</Text>
            </LinearGradient>
          </PressableScale>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  unsupported: { padding: 24, color: colors.muted, fontSize: 16 },
  back: { position: 'absolute', left: 16, backgroundColor: colors.card, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 14 },
  backText: { color: colors.primary, fontSize: 16, fontWeight: '700' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, gap: 12 },
  input: { backgroundColor: colors.bg, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, fontSize: 16, color: colors.text },
  result: { gap: 2 },
  resultLabel: { color: colors.muted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  resultName: { color: colors.text, fontSize: 20, fontWeight: '800' },
  muted: { color: colors.muted, fontSize: 14 },
  hint: { color: colors.muted, fontSize: 13, marginTop: 4 },
  wake: { borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  wakeText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
