import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { updateAlarm } from '@/alarm';
import { useNow } from '@/api';
import { showToast } from '@/components/Toast';
import { formatDistance } from '@/geo';
import { BACKUP_OPTIONS_MIN, RADII_M } from '@/settings';
import type { ArmedTrip } from '@/storage';
import { PressableScale } from '@/ui';

const formatClock = (ms: number) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

// Change the ring distance and backup of an alarm that's already set. Sits on the dark alarm cards.
export function AlarmEditor({ trip, onDone }: { trip: ArmedTrip; onDone: () => void }) {
  const [radius, setRadius] = useState(RADII_M.includes(trip.radius) ? trip.radius : RADII_M[1]);
  const [backupMin, setBackupMin] = useState(trip.backupMin ?? 0);
  const [saving, setSaving] = useState(false);
  const now = useNow();
  // Alarms set before this version don't know when the bus is due, so only the distance can change.
  const dueAt = trip.dueAt;

  async function save() {
    setSaving(true);
    await updateAlarm({ radius, backupMin });
    setSaving(false);
    showToast('Alarm updated');
    onDone();
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Ring when the bus is within</Text>
      <View style={styles.chips}>
        {RADII_M.map((m) => (
          <Chip key={m} label={formatDistance(m)} on={m === radius} onPress={() => setRadius(m)} />
        ))}
      </View>

      {dueAt != null && (
        <>
          <Text style={styles.label}>Backup alarm</Text>
          <View style={styles.chips}>
            {BACKUP_OPTIONS_MIN.map((min) => {
              const at = dueAt - min * 60000;
              const past = min > 0 && at <= now;
              return (
                <Chip
                  key={min}
                  label={min === 0 ? 'Off' : `${min} min · ${formatClock(at)}`}
                  on={min === backupMin}
                  disabled={past}
                  onPress={() => setBackupMin(min)}
                />
              );
            })}
          </View>
        </>
      )}

      <View style={styles.buttons}>
        <PressableScale onPress={onDone} style={styles.secondary}>
          <Text style={styles.secondaryText}>Cancel</Text>
        </PressableScale>
        <PressableScale onPress={save} disabled={saving} style={styles.primary}>
          <Text style={styles.primaryText}>{saving ? 'Saving…' : 'Save'}</Text>
        </PressableScale>
      </View>
    </View>
  );
}

function Chip({ label, on, disabled, onPress }: { label: string; on: boolean; disabled?: boolean; onPress: () => void }) {
  return (
    <PressableScale onPress={onPress} disabled={disabled} style={[styles.chip, on && styles.chipOn, disabled && styles.chipDisabled]}>
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10, alignSelf: 'stretch' },
  label: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.1)' },
  chipOn: { backgroundColor: '#fff' },
  chipDisabled: { opacity: 0.35 },
  chipText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  chipTextOn: { color: '#1e1b4b' },
  buttons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 4 },
  secondary: { paddingVertical: 9, paddingHorizontal: 16, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)' },
  secondaryText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  primary: { paddingVertical: 9, paddingHorizontal: 20, borderRadius: 12, backgroundColor: '#fff' },
  primaryText: { color: '#1e1b4b', fontSize: 14, fontWeight: '700' },
});
