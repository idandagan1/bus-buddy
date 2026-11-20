import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { detourLine, detoursNear, type Detour } from '@/detours';
import type { Advisory, Stop } from '@/types';
import { Collapsible, colors, PressableScale, shadow, ToggleIcon } from '@/ui';

export const severityStyle = {
  high: { color: '#ea580c', soft: '#fff4ec', icon: '⚠️' },
  low: { color: '#0e7490', soft: '#ecfaff', icon: 'ℹ️' },
  info: { color: colors.primary, soft: colors.primarySoft, icon: '💬' },
};

// Detours look urgent whatever the carrier's severity says (NJ Transit marks them low): a bus that leaves its
// street skips the stops on it.
const detourStyle = { ...severityStyle.high, icon: '↪️' };

const rank = { high: 0, low: 1, info: 2 };
const nearRank = (d: Detour | undefined) => (d?.near === 'street' ? 0 : d?.near === 'town' ? 1 : d ? 2 : 3);

// Service alerts: detours near the rider's stops first, then the rest by severity; tap one to expand it.
export function Advisories({ advisories, stops = [] }: { advisories: Advisory[]; stops?: Stop[] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!advisories.length) return null;
  const detours = new Map(detoursNear(advisories, stops).map((d) => [d.advisory.id, d]));
  const sorted = [...advisories].sort((a, b) => nearRank(detours.get(a.id)) - nearRank(detours.get(b.id)) || rank[a.severity] - rank[b.severity]);

  return (
    <View style={{ gap: 8 }}>
      {sorted.map((a, i) => {
        const detour = detours.get(a.id);
        const s = detour ? detourStyle : (severityStyle[a.severity] ?? severityStyle.info);
        const expanded = open === a.id;
        return (
          <Animated.View key={a.id} entering={FadeInDown.delay(i * 70).duration(400)}>
            <PressableScale onPress={() => setOpen(expanded ? null : a.id)} style={[styles.card, shadow, { backgroundColor: s.soft, borderLeftColor: s.color }]}>
              {detour?.near && <Text style={[styles.near, { color: s.color }]}>{detourLine(detour)}</Text>}
              <View style={styles.row}>
                <Text style={styles.icon}>{s.icon}</Text>
                <Text style={[styles.heading, { color: s.color }]} numberOfLines={expanded ? undefined : 2}>{a.heading}</Text>
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
  near: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4, paddingBottom: 6 },
  heading: { flex: 1, fontSize: 15, fontWeight: '700' },
  preview: { color: colors.muted, fontSize: 13, paddingTop: 4, paddingLeft: 27 },
  body: { gap: 6, paddingTop: 8 },
  bodyText: { color: colors.text, fontSize: 14, lineHeight: 20 },
});
