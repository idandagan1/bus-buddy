import * as Location from 'expo-location';
import { LinearGradient } from 'expo-linear-gradient';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Moon, NightSky } from '@/components/NightSky';
import { RouteSketch } from '@/components/RouteSketch';
import { useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native';
import { arm, disarm, requestPermissions, subscribe } from '@/alarm';
import { distanceMeters } from '@/geo';
import { loadArmedTrip, loadDestinations, saveDestinations, type ArmedTrip, type Destination } from '@/storage';

const RADII = [500, 1000, 2000, 3000];

const formatDistance = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);

export default function AlarmScreen() {
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [trip, setTrip] = useState<ArmedTrip | null>(null);
  const [radius, setRadius] = useState(1000);
  const [query, setQuery] = useState('');
  const [here, setHere] = useState<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    loadDestinations().then(setDestinations);
    loadArmedTrip().then(setTrip);
    const unsubscribe = subscribe(setTrip);
    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!trip) return;
    let sub: Location.LocationSubscription | undefined;
    Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced, distanceInterval: 50 }, (loc) =>
      setHere(loc.coords),
    ).then((s) => (sub = s));
    return () => sub?.remove();
  }, [trip]);

  async function addDestination(name: string, coords: { latitude: number; longitude: number }) {
    const next = [...destinations, { id: String(Date.now()), name, ...coords }];
    setDestinations(next);
    await saveDestinations(next);
    setQuery('');
  }

  async function addFromSearch() {
    const name = query.trim();
    if (!name) return;
    const results = await Location.geocodeAsync(name).catch(() => []);
    if (!results.length) return Alert.alert('Not found', 'Try a fuller address, e.g. "Main St & Engle St, Tenafly NJ".');
    await addDestination(name, results[0]);
  }

  async function addCurrentLocation() {
    const error = await requestPermissions();
    if (error) return Alert.alert('Permission needed', error);
    const { coords } = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    Alert.prompt('Name this stop', undefined, (name) => name?.trim() && addDestination(name.trim(), coords));
  }

  async function start(dest: Destination) {
    const error = await requestPermissions();
    if (error) return Alert.alert('Permission needed', error);
    await arm(dest, radius);
  }

  function remove(dest: Destination) {
    Alert.alert(`Delete ${dest.name}?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const next = destinations.filter((d) => d.id !== dest.id);
          setDestinations(next);
          await saveDestinations(next);
        },
      },
    ]);
  }

  const distance = trip && here ? distanceMeters(here, trip) : null;

  if (trip?.fired) {
    return (
      <LinearGradient colors={['#f97316', '#e11d48']} style={styles.fill}>
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView style={styles.armed}>
          <StatusBar style="light" />
          <Text style={styles.firedEmoji}>⏰</Text>
          <Text style={styles.nightLabel}>You’re almost there!</Text>
          <Text style={styles.nightName}>{trip.name}</Text>
          <Pressable style={styles.stopButton} onPress={disarm}>
            <Text style={styles.stopText}>STOP ALARM</Text>
          </Pressable>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  if (trip) {
    return (
      <View style={styles.fill}>
        <Stack.Screen options={{ headerShown: false }} />
        <NightSky>
          <SafeAreaView style={styles.armed}>
            <StatusBar style="light" />
            <Text style={styles.nightBack} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>‹ Back</Text>
            <Moon size={trip.path && trip.path.length > 1 ? 100 : 140} />
            <Animated.Text entering={FadeIn.delay(200).duration(800)} style={styles.sleepWell}>Sleep well</Animated.Text>
            <Animated.View entering={FadeIn.delay(400).duration(800)} style={{ alignItems: 'center', gap: 4 }}>
              <Text style={styles.nightLabel}>We’ll wake you before</Text>
              <Text style={styles.nightName}>{trip.name}</Text>
            </Animated.View>
            <Animated.View entering={FadeIn.delay(600).duration(800)} style={styles.nightCard}>
              {trip.path && trip.path.length > 1 && <RouteSketch path={trip.path} me={here} />}
              {distance != null && <Text style={styles.nightBig}>{formatDistance(distance)} away</Text>}
              <Text style={styles.nightInfo}>Rings when the bus is {formatDistance(trip.radius)} from your stop</Text>
              {trip.backupAt && (
                <Text style={styles.nightInfo}>Backup alarm at {new Date(trip.backupAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</Text>
              )}
            </Animated.View>
            <Pressable style={styles.cancelButton} onPress={disarm}>
              <Text style={styles.cancelText}>Cancel alarm</Text>
            </Pressable>
            <Text style={styles.nightHint}>Rings like a regular iPhone alarm, even on silent.</Text>
          </SafeAreaView>
        </NightSky>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <Text style={styles.title}>Wake me at…</Text>

      <Text style={styles.section}>Ring when within</Text>
      <View style={styles.row}>
        {RADII.map((r) => (
          <Pressable key={r} style={[styles.chip, r === radius && styles.chipActive]} onPress={() => setRadius(r)}>
            <Text style={[styles.chipText, r === radius && styles.light]}>{formatDistance(r)}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.section}>My stops</Text>
      <FlatList
        data={destinations}
        keyExtractor={(d) => d.id}
        ListEmptyComponent={<Text style={styles.muted}>Add your stop below. Tap a stop to set the alarm, long-press to delete.</Text>}
        renderItem={({ item }) => (
          <Pressable style={styles.stop} onPress={() => start(item)} onLongPress={() => remove(item)}>
            <Text style={styles.stopName}>{item.name}</Text>
            <Text style={styles.go}>Start ›</Text>
          </Pressable>
        )}
      />

      <View style={styles.add}>
        <TextInput
          style={styles.input}
          placeholder="Search an address or stop"
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={addFromSearch}
          returnKeyType="search"
        />
        <Pressable onPress={addCurrentLocation}>
          <Text style={styles.link}>＋ Save my current location as a stop</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingHorizontal: 20 },
  title: { fontSize: 32, fontWeight: '700', marginTop: 24, marginBottom: 8 },
  section: { fontSize: 13, fontWeight: '600', color: '#666', textTransform: 'uppercase', marginTop: 20, marginBottom: 8 },
  row: { flexDirection: 'row', gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, backgroundColor: '#eee' },
  chipActive: { backgroundColor: '#1565c0' },
  chipText: { fontWeight: '600' },
  light: { color: '#fff' },
  stop: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 18, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#ccc' },
  stopName: { fontSize: 18 },
  go: { fontSize: 16, color: '#1565c0', fontWeight: '600' },
  muted: { color: '#888', fontSize: 15 },
  add: { paddingVertical: 16, gap: 12 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 10, padding: 12, fontSize: 16 },
  link: { color: '#1565c0', fontSize: 16 },
  fill: { flex: 1 },
  armed: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 14, paddingHorizontal: 24 },
  sleepWell: { color: '#fff', fontSize: 40, fontWeight: '800', letterSpacing: -0.8 },
  nightLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 16 },
  nightName: { color: '#fff', fontSize: 24, fontWeight: '700', textAlign: 'center' },
  nightCard: { marginTop: 8, alignSelf: 'stretch', maxWidth: 420, alignItems: 'center', gap: 4, padding: 16, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  nightBig: { color: '#fde68a', fontSize: 28, fontWeight: '800' },
  nightInfo: { color: 'rgba(255,255,255,0.75)', fontSize: 14, textAlign: 'center' },
  cancelButton: { marginTop: 12, paddingVertical: 14, paddingHorizontal: 36, borderRadius: 16, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.35)' },
  cancelText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  nightBack: { position: 'absolute', top: 56, left: 20, color: 'rgba(255,255,255,0.75)', fontSize: 16, fontWeight: '600' },
  nightHint: { color: 'rgba(255,255,255,0.5)', fontSize: 13, textAlign: 'center', marginTop: 4 },
  firedEmoji: { fontSize: 72 },
  stopButton: { marginTop: 28, backgroundColor: '#fff', paddingVertical: 20, paddingHorizontal: 48, borderRadius: 18 },
  stopText: { fontSize: 22, fontWeight: '800', color: '#e11d48' },
});
