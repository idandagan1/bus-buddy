import { StyleSheet, Text, View } from 'react-native';
import type { Stop } from '@/types';

// Each carrier's own colors: Coach USA's logo blue and red, NJ Transit's site navy and orange.
const CARRIERS = {
  coach: { name: 'Coach USA', bg: '#0461A9', stripe: '#EB2030' },
  njt: { name: 'NJ Transit', bg: '#1A2B57', stripe: '#F5600D' },
};

// Which company runs a saved route. A route's stops always share a carrier, so the origin is enough.
export function CarrierTag({ stop, onDark }: { stop: Stop; onDark?: boolean }) {
  const c = stop.carrier === 'NJT' ? CARRIERS.njt : CARRIERS.coach;
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
});
