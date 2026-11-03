import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { formatTime } from '@/api';
import type { LiveSummary } from '@/live';
import { colors, PulseDot } from '@/ui';

export const toneColors = {
  good: { fg: '#047857', bg: '#ecfdf5' },
  warn: { fg: '#b45309', bg: '#fffbeb' },
  bad: { fg: '#be123c', bg: '#fff1f2' },
  info: { fg: colors.primary, bg: colors.primarySoft },
};

// inline: sits in a row next to other content, sized to its text.
export function LiveStatus({ summary, compact, inline }: { summary: LiveSummary; compact?: boolean; inline?: boolean }) {
  const c = toneColors[summary.tone];
  return (
    <Animated.View entering={FadeIn.duration(250)} style={[styles.row, { backgroundColor: c.bg }, compact && styles.compact, inline && styles.inline]}>
      {summary.live ? <PulseDot color={c.fg} size={7} /> : <View style={[styles.dot, { backgroundColor: c.fg }]} />}
      <Text style={[styles.text, { color: c.fg }]} numberOfLines={compact || inline ? 1 : 2}>
        {summary.text}
        {!compact && summary.arrivalDelayMin ? ` · ≈ ${formatTime(summary.arrival)}` : ''}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, paddingVertical: 7, paddingHorizontal: 10, marginTop: 10 },
  compact: { marginTop: 0, paddingVertical: 5 },
  inline: { marginTop: 0, paddingVertical: 4, alignSelf: 'flex-start', maxWidth: '100%' },
  dot: { width: 7, height: 7, borderRadius: 4 },
  text: { flexShrink: 1, fontSize: 13, fontWeight: '600' },
});
