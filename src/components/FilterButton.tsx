import { StyleSheet, Text } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors, PressableScale } from '@/ui';

// Opens and closes a card's line chips. Closed with a filter on, it names the lines showing ("166T") in the
// filter's color, so a narrowed list never looks like the whole schedule.
// onDark: on the schedule's blue header, where it matches the Map button beside it and turns white once on.
export function FilterButton({ only, open, onPress, onDark }: { only?: string[]; open: boolean; onPress: () => void; onDark?: boolean }) {
  const on = !!only?.length;
  const tint = onDark ? (on ? colors.primary : '#fff') : on ? '#fff' : colors.primary;
  return (
    <PressableScale
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={on ? `Filter: showing ${only!.join(' and ')} only` : 'Filter lines'}
      accessibilityState={{ expanded: open }}
      style={onDark ? [styles.button, styles.dark, open && !on && styles.darkOpen, on && styles.darkOn] : [styles.button, open && !on && styles.open, on && styles.on]}
    >
      <Svg width={onDark ? 14 : 12} height={onDark ? 14 : 12} viewBox="0 0 24 24">
        <Path d="M3 4h18l-7 8.5V19l-4 2v-8.5L3 4z" fill={tint} />
      </Svg>
      <Text style={[styles.text, onDark && styles.darkText, { color: tint }]}>{on ? only!.join(', ') : 'Filter'}</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primarySoft,
  },
  open: { borderColor: colors.primary },
  on: { backgroundColor: colors.primary, borderColor: colors.primary },
  dark: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: 'rgba(255,255,255,0.18)', borderColor: 'rgba(255,255,255,0.3)' },
  darkOpen: { borderColor: '#fff' },
  darkOn: { backgroundColor: '#fff', borderColor: '#fff' },
  darkText: { fontSize: 14, letterSpacing: 0 },
  text: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
});
