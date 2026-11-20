import { StyleSheet, Text, View } from 'react-native';
import { routeLabel, type RouteKind } from '@/routeFilter';
import type { Trip } from '@/types';

// One look per kind of bus, the same on rows, chips and headers: express purple, Turnpike pink (not green, which
// reads as chosen), local gray,
// Coach USA in its blue.
export const kindColors: Record<RouteKind, { fg: string; bg: string }> = {
  express: { fg: '#6d28d9', bg: '#f3e8ff' },
  turnpike: { fg: '#be185d', bg: '#fce7f3' },
  local: { fg: '#475569', bg: '#eef2f6' },
  coach: { fg: '#0461A9', bg: '#e0efff' },
  plain: { fg: '#2563eb', bg: '#e8efff' },
};

export function RouteBadge({ trip, routes }: { trip: Trip; routes: string[] }) {
  const { label, kind } = routeLabel(trip.route, trip.carrierCode, routes);
  const c = kindColors[kind];
  // Just the line, as on the chips; its color says express, Turnpike, local or Coach USA, and screen readers get it in words.
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]} accessible accessibilityLabel={label}>
      <Text style={[styles.text, { color: c.fg }]} numberOfLines={1}>{trip.route}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  text: { fontWeight: '700', fontSize: 12 },
});
