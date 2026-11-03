import * as Location from 'expo-location';
import { StatusBar } from 'expo-status-bar';
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
  const [distance, setDistance] = useState<number | null>(null);

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
      setDistance(distanceMeters(loc.coords, trip)),
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

  if (trip) {
    return (
      <SafeAreaView style={[styles.container, trip.fired && styles.firedBg]}>
        <StatusBar style={trip.fired ? 'light' : 'dark'} />
        <View style={styles.armed}>
          <Text style={[styles.armedLabel, trip.fired && styles.light]}>{trip.fired ? 'You’re almost there!' : 'Sleep well — alarm set for'}</Text>
          <Text style={[styles.armedName, trip.fired && styles.light]}>{trip.name}</Text>
          {!trip.fired && (
            <Text style={styles.muted}>
              Rings {formatDistance(trip.radius)} before{distance != null ? ` · ${formatDistance(distance)} away` : ''}
            </Text>
          )}
          <Pressable style={[styles.bigButton, trip.fired && styles.stopButton]} onPress={disarm}>
            <Text style={[styles.bigButtonText, trip.fired && styles.stopText]}>{trip.fired ? 'STOP ALARM' : 'Cancel alarm'}</Text>
          </Pressable>
          {!trip.fired && <Text style={styles.hint}>It rings like a regular iPhone alarm, even on silent. A backup alarm is also set 5 min before the scheduled arrival.</Text>}
        </View>
      </SafeAreaView>
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
  firedBg: { backgroundColor: '#c62828' },
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
  armed: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  armedLabel: { fontSize: 18, color: '#555' },
  armedName: { fontSize: 34, fontWeight: '700', textAlign: 'center' },
  bigButton: { marginTop: 32, backgroundColor: '#333', paddingVertical: 18, paddingHorizontal: 40, borderRadius: 14 },
  stopButton: { backgroundColor: '#fff' },
  bigButtonText: { fontSize: 20, fontWeight: '700', color: '#fff' },
  stopText: { color: '#c62828' },
  hint: { color: '#888', marginTop: 16, textAlign: 'center' },
});
