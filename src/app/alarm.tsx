import * as Location from 'expo-location';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { disarm, subscribe } from '@/alarm';
import { Moon, NightSky } from '@/components/NightSky';
import { RouteSketch } from '@/components/RouteSketch';
import { showToast } from '@/components/Toast';
import { AlarmEditor } from '@/components/AlarmEditor';
import { distanceToStop, formatDistance } from '@/geo';
import { loadArmedTrip, type ArmedTrip } from '@/storage';

const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));

// Sleep screen while an alarm is armed. Once it rings or with no alarm there is nothing to show.
export default function AlarmScreen() {
  // undefined while loading, null when no alarm is set.
  const [trip, setTrip] = useState<ArmedTrip | null | undefined>(undefined);
  const [here, setHere] = useState<{ latitude: number; longitude: number } | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    loadArmedTrip().then(setTrip);
    const unsubscribe = subscribe(setTrip);
    return () => {
      unsubscribe();
    };
  }, []);

  // Cancelled, rung, or never set: go back to wherever the rider came from.
  useEffect(() => {
    if (trip === null) leave();
  }, [trip]);

  useEffect(() => {
    if (!trip) return;
    let sub: Location.LocationSubscription | undefined;
    let closed = false;
    Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced, distanceInterval: 50 }, (loc) => setHere(loc.coords)).then((s) => {
      // Left the screen before the watch started: stop it right away so GPS doesn't stay on.
      if (closed) s.remove();
      else sub = s;
    });
    return () => {
      closed = true;
      sub?.remove();
    };
  }, [trip]);

  const distance = trip && here ? distanceToStop(here, trip) : null;

  function cancel() {
    showToast('Alarm cancelled');
    disarm();
  }

  if (!trip) return <Stack.Screen options={{ headerShown: false }} />;

  const hasPath = !!trip.path && trip.path.length > 1;
  return (
    <View style={styles.fill}>
      <Stack.Screen options={{ headerShown: false }} />
      <NightSky>
        <SafeAreaView style={styles.armed}>
          <StatusBar style="light" />
          <Pressable onPress={leave} hitSlop={12} style={styles.nightBack}>
            <Text style={styles.nightBackText}>‹ Back</Text>
          </Pressable>
          <Moon size={hasPath ? 100 : 140} />
          <Animated.Text entering={FadeIn.delay(200).duration(800)} style={styles.sleepWell}>Sleep well</Animated.Text>
          <Animated.View entering={FadeIn.delay(400).duration(800)} style={{ alignItems: 'center', gap: 4 }}>
            <Text style={styles.nightLabel}>We’ll wake you before</Text>
            <Text style={styles.nightName}>{trip.name}</Text>
          </Animated.View>
          <Animated.View entering={FadeIn.delay(600).duration(800)} style={styles.nightCard}>
            {hasPath && <RouteSketch path={trip.path!} me={here} />}
            {distance != null && <Text style={styles.nightBig}>{formatDistance(distance)} to go</Text>}
            {editing ? (
              <AlarmEditor trip={trip} onDone={() => setEditing(false)} />
            ) : (
              <>
                <Text style={styles.nightInfo}>Alarm rings {formatDistance(trip.radius)} before your stop</Text>
                {trip.backupAt && (
                  <Text style={styles.nightInfo}>Backup alarm at {new Date(trip.backupAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</Text>
                )}
                <Text style={styles.nightEdit} onPress={() => setEditing(true)}>Change</Text>
              </>
            )}
          </Animated.View>
          <Pressable style={styles.cancelButton} onPress={cancel}>
            <Text style={styles.cancelText}>Cancel alarm</Text>
          </Pressable>
          <Text style={styles.nightHint}>Rings like a regular iPhone alarm, even on silent.</Text>
        </SafeAreaView>
      </NightSky>
    </View>
  );
}

const styles = StyleSheet.create({
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
  nightEdit: { color: '#a5b4fc', fontSize: 15, fontWeight: '700', marginTop: 6, paddingVertical: 4, paddingHorizontal: 12 },
  nightBack: { position: 'absolute', top: 52, left: 16, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  nightBackText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  nightHint: { color: 'rgba(255,255,255,0.5)', fontSize: 13, textAlign: 'center', marginTop: 4 },
});
