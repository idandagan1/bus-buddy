import { StyleSheet, Text, View } from 'react-native';
import type { Stop } from '@/types';
import { colors } from '@/ui';

// Which company runs a saved route. A route's stops always share a carrier, so the origin is enough.
export function CarrierTag({ stop, onDark }: { stop: Stop; onDark?: boolean }) {
  return (
    <View style={[styles.tag, onDark && styles.tagDark]}>
      <Text style={[styles.text, onDark && styles.textDark]}>{stop.carrier === 'NJT' ? 'NJ Transit' : 'Coach USA'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: { alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border },
  tagDark: { backgroundColor: 'rgba(255,255,255,0.14)', borderColor: 'rgba(255,255,255,0.25)' },
  text: { fontSize: 11, fontWeight: '700', color: colors.muted, letterSpacing: 0.3 },
  textDark: { color: 'rgba(255,255,255,0.9)' },
});
