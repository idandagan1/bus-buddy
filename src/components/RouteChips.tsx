import { ScrollView, StyleSheet, Text } from 'react-native';
import { routeChoices, toggleRoute } from '@/routeFilter';
import type { Trip } from '@/types';
import { colors, PressableScale } from '@/ui';

// "All · 166 · 166T · 166X": which of a saved route's buses to show. Hidden when only one route runs.
export function RouteChips({ trips, only, onChange, onDark }: { trips: Trip[] | null; only?: string[]; onChange: (only: string[] | undefined) => void; onDark?: boolean }) {
  const choices = routeChoices(trips, only);
  if (!choices.length) return null;
  const chip = (label: string, on: boolean, value: string | null) => (
    <PressableScale
      key={label}
      onPress={() => onChange(toggleRoute(only, value, choices))}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={[styles.chip, onDark && styles.chipDark, on && (onDark ? styles.onDark : styles.on)]}
    >
      <Text style={[styles.text, onDark && styles.textDark, on && (onDark ? styles.onDarkText : styles.onText)]}>{label}</Text>
    </PressableScale>
  );
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {chip('All', !only?.length, null)}
      {choices.map((r) => chip(r, !!only?.includes(r), r))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 6 },
  chip: { borderRadius: 999, paddingVertical: 5, paddingHorizontal: 12, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border },
  chipDark: { backgroundColor: 'rgba(255,255,255,0.12)', borderColor: 'rgba(255,255,255,0.25)' },
  on: { backgroundColor: colors.primary, borderColor: colors.primary },
  onDark: { backgroundColor: '#fff', borderColor: '#fff' },
  text: { color: colors.text, fontSize: 13, fontWeight: '700' },
  textDark: { color: '#fff' },
  onText: { color: '#fff' },
  onDarkText: { color: colors.primary },
});
