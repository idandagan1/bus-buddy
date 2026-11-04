import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { disarm, subscribe } from '@/alarm';
import { AlarmEditor } from '@/components/AlarmEditor';
import { showToast } from '@/components/Toast';
import { formatDistance } from '@/geo';
import { loadArmedTrip, type ArmedTrip } from '@/storage';
import { colors, PressableScale, PulseDot, shadow } from '@/ui';

const formatClock = (ms: number) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

// Dashboard section for the wake-up alarm (iPhone only): the armed trip, or a hint on how to set one.
export function MyAlarms() {
  const [trip, setTrip] = useState<ArmedTrip | null>(null);
  const [editing, setEditing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadArmedTrip().then(setTrip);
    }, []),
  );
  useEffect(() => {
    const unsubscribe = subscribe(setTrip);
    return () => {
      unsubscribe();
    };
  }, []);

  function cancel() {
    if (!trip) return;
    Alert.alert('Cancel this alarm?', trip.name, [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Cancel alarm',
        style: 'destructive',
        onPress: () => {
          showToast(trip.fired ? 'Have a good day 👋' : 'Alarm cancelled');
          disarm();
        },
      },
    ]);
  }

  return (
    <View style={{ gap: 12 }}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>My alarms</Text>
        {trip && (
          <View style={styles.countPill}>
            <Text style={styles.countText}>1</Text>
          </View>
        )}
      </View>

      {trip ? (
        <LinearGradient colors={['#13184a', '#2a1b5c']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.card, shadow]}>
          <PressableScale onPress={() => router.push('/alarm')}>
            <View style={styles.row}>
              <Text style={styles.icon}>{trip.fired ? '⏰' : '🌙'}</Text>
              <View style={{ flex: 1, gap: 2 }}>
                <View style={styles.row}>
                  <PulseDot color={trip.fired ? '#fb7185' : '#a5b4fc'} size={7} />
                  <Text style={styles.state}>{trip.fired ? 'Ringing now' : 'Armed'}</Text>
                </View>
                <Text style={styles.name} numberOfLines={1}>Wake me before {trip.name}</Text>
                <Text style={styles.info} numberOfLines={1}>
                  Rings {formatDistance(trip.radius)} away{trip.backupAt ? ` · backup ${formatClock(trip.backupAt)}` : ''}
                </Text>
              </View>
              <Text style={styles.arrow}>›</Text>
            </View>
          </PressableScale>
          {editing && !trip.fired ? (
            <View style={styles.editor}>
              <AlarmEditor trip={trip} onDone={() => setEditing(false)} />
            </View>
          ) : (
            <View style={styles.actions}>
              {!trip.fired && (
                <PressableScale onPress={() => setEditing(true)} style={styles.cancel}>
                  <Text style={styles.cancelText}>Edit</Text>
                </PressableScale>
              )}
              <PressableScale onPress={cancel} style={styles.cancel}>
                <Text style={styles.cancelText}>{trip.fired ? 'Stop alarm' : 'Cancel'}</Text>
              </PressableScale>
            </View>
          )}
        </LinearGradient>
      ) : (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No alarm set. Open a route, tap a trip and choose “Wake me up”.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, paddingHorizontal: 4 },
  sectionTitle: { fontSize: 20, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },
  countPill: { backgroundColor: colors.primarySoft, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  countText: { color: colors.primary, fontWeight: '700', fontSize: 13 },
  card: { borderRadius: 20, padding: 16, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  icon: { fontSize: 30, marginRight: 4 },
  state: { color: '#c7d2fe', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  name: { color: '#fff', fontSize: 17, fontWeight: '700' },
  info: { color: 'rgba(255,255,255,0.7)', fontSize: 13 },
  arrow: { color: 'rgba(255,255,255,0.6)', fontSize: 26, fontWeight: '300' },
  editor: { borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.12)', paddingTop: 12 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.12)', paddingTop: 12 },
  cancel: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)' },
  cancelText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  empty: { borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, padding: 14 },
  emptyText: { color: colors.muted, fontSize: 14 },
});
