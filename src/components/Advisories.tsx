import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { Advisory } from '@/types';
import { Collapsible, colors, PressableScale, shadow, ToggleIcon } from '@/ui';

export const severityStyle = {
  high: { color: '#ea580c', soft: '#fff4ec', icon: '⚠️' },
  low: { color: '#0e7490', soft: '#ecfaff', icon: 'ℹ️' },
  info: { color: colors.primary, soft: colors.primarySoft, icon: '💬' },
};

const rank = { high: 0, low: 1, info: 2 };

// Coach USA service alerts, most severe first; tap one to expand.
export function Advisories({ advisories }: { advisories: Advisory[] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!advisories.length) return null;
  const sorted = [...advisories].sort((a, b) => rank[a.severity] - rank[b.severity]);

  return (
    <View style={{ gap: 8 }}>
      {sorted.map((a, i) => {
        const s = severityStyle[a.severity] ?? severityStyle.info;
        const expanded = open === a.id;
        return (
          <Animated.View key={a.id} entering={FadeInDown.delay(i * 70).duration(400)}>
            <PressableScale onPress={() => setOpen(expanded ? null : a.id)} style={[styles.card, shadow, { backgroundColor: s.soft, borderLeftColor: s.color }]}>
              <View style={styles.row}>
                <Text style={styles.icon}>{s.icon}</Text>
                <Text style={[styles.heading, { color: s.color }]} numberOfLines={2}>{a.heading}</Text>
                <ToggleIcon open={expanded} color={s.color} />
              </View>
              {!!a.paragraphs[0] && (
                <Collapsible expanded={!expanded}>
                  <Text style={styles.preview} numberOfLines={1}>{a.paragraphs[0]}</Text>
                </Collapsible>
              )}
              <Collapsible expanded={expanded}>
                <View style={styles.body}>
                  {a.paragraphs.map((p, j) => (
                    <Text key={j} style={styles.bodyText}>{p}</Text>
                  ))}
                </View>
              </Collapsible>
            </PressableScale>
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, padding: 12, paddingLeft: 14, borderLeftWidth: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  icon: { fontSize: 15 },
  heading: { flex: 1, fontSize: 15, fontWeight: '700' },
  preview: { color: colors.muted, fontSize: 13, paddingTop: 4, paddingLeft: 27 },
  body: { gap: 6, paddingTop: 8 },
  bodyText: { color: colors.text, fontSize: 14, lineHeight: 20 },
});
