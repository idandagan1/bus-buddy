import { StyleSheet, Text, View } from 'react-native';
import { routeLabel, type RouteKind } from '@/routeFilter';
import type { Trip } from '@/types';

// One look per kind of bus, the same on rows, chips and headers: express purple, Turnpike teal, local gray,
// Coach USA in its blue.
export const kindColors: Record<RouteKind, { fg: string; bg: string }> = {
  express: { fg: '#6d28d9', bg: '#f3e8ff' },
  turnpike: { fg: '#0f766e', bg: '#ccfbf1' },
  local: { fg: '#475569', bg: '#eef2f6' },
  coach: { fg: '#0461A9', bg: '#e0efff' },
  plain: { fg: '#2563eb', bg: '#e8efff' },
};

export function RouteBadge({ trip, routes }: { trip: Trip; routes: string[] }) {
  const { label, kind } = routeLabel(trip.route, trip.carrierCode, routes);
  const c = kindColors[kind];
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <Text style={[styles.text, { color: c.fg }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  text: { fontWeight: '700', fontSize: 12 },
});
