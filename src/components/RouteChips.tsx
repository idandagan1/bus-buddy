import { ScrollView, StyleSheet, Text } from 'react-native';
import { routeChoices, routeLabel, toggleRoute } from '@/routeFilter';
import { kindColors } from './RouteBadge';
import type { Trip } from '@/types';
import { colors, PressableScale } from '@/ui';

// "All · 166 Local · 166T Turnpike · 166X Express": which of a saved route's buses to show, in the same colors as
// the badges on each bus. Hidden when only one route runs.
export function RouteChips({ trips, only, onChange, onDark }: { trips: Trip[] | null; only?: string[]; onChange: (only: string[] | undefined) => void; onDark?: boolean }) {
  const choices = routeChoices(trips, only);
  if (!choices.length) return null;
  const carrierOf = new Map((trips ?? []).map((t) => [t.route, t.carrierCode]));
  const chip = (label: string, on: boolean, value: string | null) => {
    const kind = value ? routeLabel(value, carrierOf.get(value) ?? 'NJT', choices).kind : null;
    const tint = kind ? kindColors[kind].fg : null;
    return (
    <PressableScale
      key={label}
      onPress={() => onChange(toggleRoute(only, value, choices))}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={[styles.chip, onDark && styles.chipDark, on && (onDark ? styles.onDark : [styles.on, tint && { backgroundColor: tint, borderColor: tint }])]}
    >
      <Text style={[styles.text, onDark && styles.textDark, !on && !onDark && tint && { color: tint }, on && (onDark ? [styles.onDarkText, tint && { color: tint }] : styles.onText)]}>
        {label}
      </Text>
    </PressableScale>
    );
  };
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {chip('All', !only?.length, null)}
      {choices.map((r) => chip(routeLabel(r, carrierOf.get(r) ?? 'NJT', choices).label, !!only?.includes(r), r))}
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
