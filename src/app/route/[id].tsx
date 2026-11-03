import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Alert, Platform, StyleSheet, Text, View } from 'react-native';
import { arm, requestPermissions } from '@/alarm';
import { loadSettings } from '@/settings';
import Animated, { FadeInDown, FadeInLeft, FadeInRight, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { dayKey, formatCountdown, formatDay, formatTime, loadRoutes, useAdvisories, useNow, useTrips } from '@/api';
import { Advisories } from '@/components/Advisories';
import { LiveStatus } from '@/components/LiveStatus';
import { statusKey, summarize, useTripStatuses, type LiveSummary } from '@/live';
import type { SavedRoute, Stop, Trip } from '@/types';
import { DayTabs } from '@/components/DayTabs';
import { Collapsible, colors, EASE_OUT, gradient, Hero, Page, PressableScale, PulseDot, shadow, Skeleton, ToggleIcon } from '@/ui';

export default function RouteScreen() {
  const { id, reversed } = useLocalSearchParams<{ id: string; reversed?: string }>();
  const [route, setRoute] = useState<SavedRoute | null>(null);

  useEffect(() => {
    loadRoutes().then((routes) => setRoute(routes.find((r) => r.id === id) ?? null));
  }, [id]);

  const isReversed = reversed === '1';
  return (
    <>
      {route ? (
        <Schedule
          from={isReversed ? route.to : route.from}
          to={isReversed ? route.from : route.to}
          onSwap={() => router.setParams({ reversed: isReversed ? '0' : '1' })}
        />
      ) : (
        <Page hero={<Hero><Skeleton height={60} style={{ backgroundColor: 'rgba(255,255,255,0.15)' }} /></Hero>}>{null}</Page>
      )}
    </>
  );
}

function Schedule({ from, to, onSwap }: { from: Stop; to: Stop; onSwap: () => void }) {
  const { trips, error, reload } = useTrips(from, to);
  const advisories = useAdvisories(trips);
  const now = useNow();
  const statuses = useTripStatuses(trips, now);
  const hasLive = Object.values(statuses).some((st) => summarize(st));
  const days = useMemo(() => [...new Set(trips?.map((t) => dayKey(t.departure)))], [trips]);
  const [day, setDay] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  // Which way the trip list slides in: toward later days from the right, earlier from the left, flips from below.
  const [motion, setMotion] = useState<'left' | 'right' | 'up'>('up');
  const next = trips?.find((t) => new Date(t.departure).getTime() > now);
  const selectedDay = day ?? (next ? dayKey(next.departure) : days[0]);
  const dayTrips = trips?.filter((t) => dayKey(t.departure) === selectedDay) ?? [];

  const spin = useSharedValue(0);
  const spinStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));
  function swap() {
    spin.set(withSpring(spin.get() + 180, { damping: 12 }));
    setDay(null);
    setExpanded(null);
    setMotion('up');
    onSwap();
  }

  function pickDay(d: string) {
    if (d === selectedDay) return;
    setMotion(days.indexOf(d) > days.indexOf(selectedDay ?? '') ? 'right' : 'left');
    setExpanded(null);
    setDay(d);
  }

  const enter = motion === 'right' ? FadeInRight : motion === 'left' ? FadeInLeft : FadeInDown;

  return (
    <Page
      hero={
        <Hero>
          <Text style={styles.back} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>‹ My routes</Text>
          <View style={styles.heroRow}>
            <Animated.View key={from.id} entering={FadeInDown.duration(450).easing(EASE_OUT)} style={{ flex: 1 }}>
              <Text style={styles.heroFrom} numberOfLines={2}>{from.name}</Text>
              <Text style={styles.heroTo} numberOfLines={1}>→ {to.name}</Text>
            </Animated.View>
            <PressableScale onPress={swap} style={styles.swap}>
              <Animated.Text style={[styles.swapIcon, spinStyle]}>⇅</Animated.Text>
              <Text style={styles.swapText}>Return</Text>
            </PressableScale>
          </View>
        </Hero>
      }
    >
      <Advisories advisories={hasLive ? advisories.filter((a) => !a.id.startsWith('bus-tracking')) : advisories} />

      {trips ? (
        <DayTabs
          tabs={days.map((d) => ({ key: d, label: formatDay(trips.find((t) => dayKey(t.departure) === d)!.departure) }))}
          selected={selectedDay}
          onSelect={pickDay}
        />
      ) : (
        <View style={styles.daySkeletons}>
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} width={96} height={36} style={{ borderRadius: 16 }} />)}
        </View>
      )}

      {error && (
        <PressableScale onPress={reload}>
          <Text style={styles.error}>{error} · tap to retry</Text>
        </PressableScale>
      )}
      {!trips && !error && [0, 1, 2, 3, 4].map((i) => <Skeleton key={i} height={64} style={{ borderRadius: 16 }} />)}
      {trips?.length === 0 && <Text style={styles.muted}>No buses found for this route.</Text>}

      <View key={`${from.id}:${selectedDay}`} style={{ gap: 10 }}>
        {dayTrips.map((t, i) => (
          <Animated.View key={t.id} entering={enter.delay(Math.min(i, 10) * 35).duration(420).easing(EASE_OUT)}>
            <TripRow trip={t} now={now} live={summarize(statuses[statusKey(t)])} isNext={t.id === next?.id} expanded={expanded === t.id} onToggle={() => setExpanded(expanded === t.id ? null : t.id)} />
          </Animated.View>
        ))}
      </View>

      <Text style={styles.footnote}>Times from Coach USA · live status updates every 30 seconds</Text>
    </Page>
  );
}

function TripRow(props: { trip: Trip; now: number; live: LiveSummary | null; isNext: boolean; expanded: boolean; onToggle: () => void }) {
  const { trip, now, isNext, live } = props;
  const past = new Date(trip.departure).getTime() < now;
  const minutes = Math.round((new Date(trip.arrival).getTime() - new Date(trip.departure).getTime()) / 60000);

  return (
    <PressableScale onPress={props.onToggle} style={[styles.trip, shadow, isNext && styles.nextTrip, past && styles.pastTrip]}>
      <View style={styles.tripRow}>
        {isNext && <PulseDot color={colors.primary} size={8} />}
        <Text style={[styles.tripTime, isNext && styles.nextText]}>{formatTime(trip.departure)}</Text>
        <Text style={styles.muted}>→ {formatTime(trip.arrival)} · {minutes} min</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{trip.route}</Text>
        </View>
      </View>
      <View style={styles.tripMeta}>
        <View style={{ flex: 1 }}>{live && <LiveStatus summary={live} inline />}</View>
        {!past && <Text style={[styles.countdown, isNext && styles.nextText]}>{formatCountdown(live?.departure ?? trip.departure, now)}</Text>}
        <ToggleIcon open={props.expanded} color={isNext ? colors.primary : colors.muted} />
      </View>
      <Collapsible expanded={props.expanded}>
        <View style={styles.timeline}>
          {trip.stops.map((s, i) => {
            const last = i === trip.stops.length - 1;
            const edge = i === 0 || last;
            return (
              <View key={i} style={styles.stopRow}>
                <Text style={[styles.stopTime, edge && styles.stopEdge]}>{formatTime(s.time)}</Text>
                <View style={styles.stopRail}>
                  <View style={[styles.stopDot, edge && styles.stopDotEdge]} />
                  {!last && <View style={styles.stopLine} />}
                </View>
                <Text style={[styles.stopName, edge && styles.stopEdge]}>{s.name}</Text>
              </View>
            );
          })}
          {Platform.OS === 'ios' && !past && <WakeButton trip={trip} live={live} />}
        </View>
      </Collapsible>
    </PressableScale>
  );
}

// Arms the wake-up alarm for this trip's last stop, with a time-based backup before the scheduled arrival.
function WakeButton({ trip, live }: { trip: Trip; live: LiveSummary | null }) {
  const stop = trip.stops.at(-1)!;
  async function wake() {
    const error = await requestPermissions();
    if (error) return Alert.alert('Permission needed', error);
    const { radiusM, backupMin } = await loadSettings();
    // Prefer the live estimated arrival so a late bus doesn't ring the backup too early.
    const arrival = live?.arrival ?? trip.arrival;
    const backupAt = backupMin ? new Date(new Date(arrival).getTime() - backupMin * 60000) : undefined;
    await arm({ id: trip.id, name: stop.name, latitude: stop.latitude, longitude: stop.longitude }, radiusM, backupAt);
    router.push('/alarm');
  }
  return (
    <PressableScale onPress={wake} style={styles.wake}>
      <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.wakeInner}>
        <Text style={styles.wakeIcon}>⏰</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.wakeText}>Wake me up</Text>
          <Text style={styles.wakeSub} numberOfLines={1}>before {stop.name}</Text>
        </View>
        <Text style={styles.wakeArrow}>›</Text>
      </LinearGradient>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  back: { color: 'rgba(255,255,255,0.85)', fontSize: 16, fontWeight: '600', marginBottom: 10 },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  heroFrom: { color: '#fff', fontSize: 24, fontWeight: '800', letterSpacing: -0.4 },
  heroTo: { color: 'rgba(255,255,255,0.8)', fontSize: 16, fontWeight: '500', marginTop: 4 },
  swap: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 18, paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  swapIcon: { color: '#fff', fontSize: 22, fontWeight: '700' },
  swapText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  daySkeletons: { flexDirection: 'row', gap: 8 },
  trip: { backgroundColor: colors.card, borderRadius: 16, padding: 16, borderWidth: 1.5, borderColor: 'transparent' },
  nextTrip: { borderColor: colors.primary, backgroundColor: '#f5f8ff' },
  pastTrip: { opacity: 0.45 },
  tripRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  tripTime: { fontSize: 19, fontWeight: '700', color: colors.text, minWidth: 78, letterSpacing: -0.3 },
  nextText: { color: colors.primary },
  badge: { backgroundColor: colors.primarySoft, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  badgeText: { color: colors.primary, fontWeight: '700', fontSize: 12 },
  tripMeta: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8, minHeight: 26 },
  countdown: { color: colors.muted, fontWeight: '600' },
  muted: { color: colors.muted, fontSize: 14 },
  error: { color: colors.danger, textAlign: 'center' },
  timeline: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderColor: colors.border },
  stopRow: { flexDirection: 'row', gap: 12, minHeight: 30 },
  stopTime: { width: 70, color: colors.muted, fontVariant: ['tabular-nums'], fontSize: 13, paddingTop: 1 },
  stopRail: { width: 14, alignItems: 'center' },
  stopDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border, marginTop: 5 },
  stopDotEdge: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.primary, marginTop: 3 },
  stopLine: { flex: 1, width: 2, backgroundColor: colors.border },
  stopName: { flex: 1, color: colors.text, fontSize: 14 },
  stopEdge: { fontWeight: '700', color: colors.text },
  wake: { marginTop: 16, marginBottom: 4 },
  wakeInner: { borderRadius: 14, paddingVertical: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  wakeIcon: { fontSize: 22 },
  wakeText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  wakeSub: { color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 1 },
  wakeArrow: { color: '#fff', fontSize: 24, fontWeight: '600' },
  footnote: { color: colors.muted, fontSize: 12, textAlign: 'center', marginTop: 8 },
});
