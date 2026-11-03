import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { colors, EASE_OUT, PressableScale, shadow } from '@/ui';

type Tab = { key: string; label: string };

const PAD = 6;
const GAP = 4;

// Segmented day picker with a highlight pill that glides to the selected day.
export function DayTabs({ tabs, selected, onSelect }: { tabs: Tab[]; selected: string | undefined; onSelect: (key: string) => void }) {
  // Only widths are measured: on web onLayout doesn't refire when a tab merely moves,
  // so x is derived from the widths of the tabs before it.
  const [widths, setWidths] = useState<Record<string, number>>({});
  const x = useSharedValue(0);
  const width = useSharedValue(0);
  const index = tabs.findIndex((t) => t.key === selected);
  const measured = index >= 0 && tabs.slice(0, index + 1).every((t) => widths[t.key]);
  const targetX = measured ? PAD + tabs.slice(0, index).reduce((sum, t) => sum + widths[t.key] + GAP, 0) : null;
  const targetW = measured ? widths[tabs[index].key] : null;

  useEffect(() => {
    if (targetX === null || targetW === null) return;
    if (width.get() === 0) {
      x.set(targetX);
      width.set(targetW);
    } else {
      x.set(withTiming(targetX, { duration: 380, easing: EASE_OUT }));
      width.set(withTiming(targetW, { duration: 380, easing: EASE_OUT }));
    }
  }, [targetX, targetW, x, width]);

  const pill = useAnimatedStyle(() => ({ opacity: width.value ? 1 : 0, width: width.value, transform: [{ translateX: x.value }] }));

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.bar, shadow]} contentContainerStyle={styles.content}>
      <Animated.View style={[styles.pill, pill]} />
      {tabs.map((t) => {
        const active = t.key === selected;
        return (
          <View
            key={t.key}
            onLayout={(e) => {
              const w = e.nativeEvent.layout.width;
              setWidths((m) => (m[t.key] === w ? m : { ...m, [t.key]: w }));
            }}
          >
            <PressableScale style={styles.tab} onPress={() => onSelect(t.key)}>
              <Text style={[styles.text, active && styles.activeText]}>{t.label}</Text>
            </PressableScale>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bar: { backgroundColor: colors.card, borderRadius: 20, flexGrow: 0 },
  content: { gap: GAP, padding: PAD },
  pill: { position: 'absolute', top: PAD, bottom: PAD, left: 0, borderRadius: 15, backgroundColor: colors.primary },
  tab: { paddingVertical: 9, paddingHorizontal: 14, borderRadius: 15 },
  text: { color: colors.text, fontWeight: '600' },
  activeText: { color: '#fff' },
});
