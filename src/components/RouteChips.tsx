import { ScrollView, StyleSheet, Text } from 'react-native';
import { routeChoices, routeLabel, toggleRoute } from '@/routeFilter';
import { kindColors } from './RouteBadge';
import type { Trip } from '@/types';
import { colors, PressableScale } from '@/ui';

// "All · 20 · 166 · 166T · 166X": which of a saved route's lines to show, each in the color of the badge on its
// buses, with the other carrier's lines from the same corner offered at the end as a dashed chip. One row that
// scrolls sideways; hidden when there's nothing to choose.
export function RouteChips(props: {
  trips: Trip[] | null;
  only?: string[];
  onChange: (only: string[] | undefined) => void;
  offer?: { label: string; onPress: () => void } | null;
  onDark?: boolean;
}) {
  const { trips, only, onChange, offer, onDark } = props;
  const choices = routeChoices(trips, only);
  if (!choices.length && !offer) return null;
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
        accessibilityLabel={value ? routeLabel(value, carrierOf.get(value) ?? 'NJT', choices).label : label}
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
      {choices.length > 0 && chip('All', !only?.length, null)}
      {choices.map((r) => chip(r, !!only?.includes(r), r))}
      {offer && (
        <PressableScale onPress={offer.onPress} hitSlop={4} accessibilityRole="button" style={[styles.chip, styles.offer, onDark && styles.offerDark]}>
          <Text style={[styles.text, styles.offerText, onDark && styles.textDark]}>{offer.label}</Text>
        </PressableScale>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 6 },
  chip: { borderRadius: 999, paddingVertical: 5, paddingHorizontal: 12, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border },
  chipDark: { backgroundColor: 'rgba(255,255,255,0.12)', borderColor: 'rgba(255,255,255,0.25)' },
  on: { backgroundColor: colors.primary, borderColor: colors.primary },
  onDark: { backgroundColor: '#fff', borderColor: '#fff' },
  offer: { backgroundColor: 'transparent', borderStyle: 'dashed', borderColor: colors.primary },
  offerDark: { borderColor: 'rgba(255,255,255,0.7)' },
  text: { color: colors.text, fontSize: 13, fontWeight: '700' },
  textDark: { color: '#fff' },
  offerText: { color: colors.primary },
  onText: { color: '#fff' },
  onDarkText: { color: colors.primary },
});
