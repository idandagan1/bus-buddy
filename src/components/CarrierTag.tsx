import { StyleSheet, Text, View } from 'react-native';
import type { Stop } from '@/types';
import { PressableScale } from '@/ui';

// Each carrier's own colors: Coach USA's logo blue and red, NJ Transit's site navy and orange.
const CARRIERS = {
  coach: { name: 'Coach USA', bg: '#0461A9', stripe: '#EB2030' },
  njt: { name: 'NJ Transit', bg: '#1A2B57', stripe: '#F5600D' },
};

// Which company runs a saved route. A route's stops always share a carrier, so the origin is enough. The other
// carrier added from the same corner gets an ✕ (onRemove) to take it off again.
export function CarrierTag({ stop, onDark, onRemove }: { stop: Stop; onDark?: boolean; onRemove?: () => void }) {
  const c = stop.carrier === 'NJT' ? CARRIERS.njt : CARRIERS.coach;
  if (onRemove) {
    return (
      <PressableScale
        onPress={onRemove}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`Remove ${c.name}`}
        style={[styles.tag, styles.removable, { backgroundColor: c.bg, borderLeftColor: c.stripe }, onDark && styles.onDark]}
      >
        <Text style={styles.text}>{c.name}</Text>
        <Text style={styles.remove}>✕</Text>
      </PressableScale>
    );
  }
  return (
    <View style={[styles.tag, { backgroundColor: c.bg, borderLeftColor: c.stripe }, onDark && styles.onDark]}>
      <Text style={styles.text}>{c.name}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: { alignSelf: 'flex-start', borderRadius: 6, borderLeftWidth: 4, paddingLeft: 6, paddingRight: 8, paddingVertical: 3 },
  // Keeps the navy tag visible against the dark blue hero.
  onDark: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', borderLeftWidth: 4 },
  text: { fontSize: 11, fontWeight: '800', color: '#fff', letterSpacing: 0.3 },
  removable: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  remove: { fontSize: 10, fontWeight: '800', color: 'rgba(255,255,255,0.8)' },
});
