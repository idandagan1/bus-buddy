import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { Alert, Platform, StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { formatCountdown, formatTime, loadRoutes, saveRoutes, useAdvisories, useNow, useTrips } from '@/api';
import { severityStyle } from '@/components/Advisories';
import { ErrorState, StaleNote } from '@/components/ErrorState';
import { GateBadge } from '@/components/GateBadge';
import { LiveStatus, toneColors } from '@/components/LiveStatus';
import { statusKey, summarize, useTripStatuses, type LiveSummary } from '@/live';
import { RoutePlanner } from '@/components/RoutePlanner';
import type { SavedRoute, Stop, Trip } from '@/types';
import { colors, EASE_OUT, gradient, Hero, Page, PressableScale, PulseDot, shadow, Skeleton } from '@/ui';

// Home stays calm: one short fade, no slides or staggers.
const CALM = FadeIn.duration(250).easing(EASE_OUT);
const SWAP = FadeIn.duration(200).easing(EASE_OUT);

const noopSubscribe = () => () => {};

// The server renders in UTC, so time-of-day greetings are only decided in the browser.
function useGreeting() {
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  if (!hydrated) return 'Hello';
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export default function Home() {
  const [routes, setRoutes] = useState<SavedRoute[] | null>(null);
  const greeting = useGreeting();

  useFocusEffect(
    useCallback(() => {
      loadRoutes().then(setRoutes);
    }, []),
  );

  async function update(next: SavedRoute[]) {
    setRoutes(next);
    await saveRoutes(next);
  }

  const addFirst = (from: Stop, to: Stop) => update([{ id: String(Date.now()), from, to }]);

  return (
    <>
      <Page
        hero={
          <Hero>
            <View style={styles.heroTop}>
              <Animated.Text style={styles.greeting}>{greeting} 👋</Animated.Text>
              <PressableScale onPress={() => router.push('/settings')} hitSlop={10} style={styles.gear}>
                <Text style={styles.gearIcon}>⚙︎</Text>
              </PressableScale>
            </View>
            <Animated.Text style={styles.title}>
              {routes?.length ? 'Your next bus' : 'Where are you headed?'}
            </Animated.Text>
            {routes?.[0] && <NextBusHero route={routes[0]} />}
          </Hero>
        }
      >
        {routes?.length === 0 && (
          <Animated.View entering={CALM}>
            <RoutePlanner onSave={addFirst} saveLabel="Save my route" />
            <Text style={styles.hint}>Save it once — next time you open the app, your buses are already here.</Text>
          </Animated.View>
        )}

        {!!routes?.length && (
          <Animated.View entering={CALM}>
            <PlannerTeaser />
          </Animated.View>
        )}

        {!!routes?.length && (
          <Animated.View entering={CALM} style={styles.section}>
            <Text style={styles.sectionTitle}>My routes</Text>
            <View style={styles.countPill}>
              <Text style={styles.countText}>{routes.length}</Text>
            </View>
            <Text style={styles.sectionHint}>Saved on this device</Text>
          </Animated.View>
        )}

        {routes?.map((r, i) => (
          <Animated.View
            key={r.id}
            entering={CALM}
            exiting={FadeOut.duration(150)}
            layout={LinearTransition.duration(250).easing(EASE_OUT)}
          >
            <RouteCard route={r} onRemove={() => update(routes.filter((x) => x.id !== r.id))} />
          </Animated.View>
        ))}
      </Page>
    </>
  );
}

function confirmRemove(name: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(`Remove this route?\n\n${name}`)) onConfirm();
    return;
  }
  Alert.alert('Remove this route?', name, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Remove', style: 'destructive', onPress: onConfirm },
  ]);
}

// Live h:mm:ss countdown to the very next bus on the first saved route.
function NextBusHero({ route }: { route: SavedRoute }) {
  const { trips } = useTrips(route.from, route.to);
  const now = useNow(1000);
  const statuses = useTripStatuses(trips, now);
  const liveOf = (t: Trip) => summarize(statuses[statusKey(t)]);
  const next = trips?.find((t) => new Date(liveOf(t)?.departure ?? t.departure).getTime() > now);
  const live = next ? liveOf(next) : null;

  if (!trips) return <Skeleton height={88} style={{ marginTop: 16, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20 }} />;
  if (!next) return null;

  const departure = live?.departure ?? next.departure;
  const secs = Math.max(0, Math.floor((new Date(departure).getTime() - now) / 1000));
  const hh = Math.floor(secs / 3600);
  const mm = String(Math.floor((secs % 3600) / 60)).padStart(2, '0');
  const ss = String(secs % 60).padStart(2, '0');

  return (
    <Animated.View entering={CALM} style={styles.glass}>
      <View style={styles.glassTop}>
        <PulseDot color="#34d399" />
        <Text style={styles.glassLabel}>{route.from.town} → {route.to.town} · Route {next.route}</Text>
      </View>
      {live && <Text style={styles.glassLive} numberOfLines={1}>{live.text}</Text>}
      <View style={styles.glassRow}>
        <Text style={styles.countdown}>{hh > 0 ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`}</Text>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.glassTime}>{formatTime(departure)}</Text>
          <Text style={styles.glassSub}>{next.gate ? `Gate ${next.gate} · ` : ''}arrives {formatTime(live?.arrival ?? next.arrival)}</Text>
        </View>
      </View>
    </Animated.View>
  );
}

function PlannerTeaser() {
  return (
    <PressableScale onPress={() => router.push('/add')} style={[styles.teaser, shadow]}>
      <View style={styles.teaserRail}>
        <View style={[styles.dot, { backgroundColor: colors.primary }]} />
        <View style={styles.teaserLine} />
        <View style={[styles.dot, { backgroundColor: colors.accent, borderRadius: 3 }]} />
      </View>
      <View style={{ flex: 1, gap: 18 }}>
        <Text style={styles.teaserText}>From</Text>
        <Text style={styles.teaserText}>To</Text>
      </View>
      <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.teaserPlus}>
        <Text style={styles.teaserPlusText}>＋</Text>
      </LinearGradient>
    </PressableScale>
  );
}

function RouteCard({ route, onRemove }: { route: SavedRoute; onRemove: () => void }) {
  const [reversed, setReversed] = useState(false);
  const from = reversed ? route.to : route.from;
  const to = reversed ? route.from : route.to;
  const { trips, error, offline, cachedAt, reload } = useTrips(from, to);
  const alerts = useAdvisories(trips).filter((a) => a.severity === 'high');
  const now = useNow();
  const statuses = useTripStatuses(trips, now);
  const liveOf = (t: Trip) => summarize(statuses[statusKey(t)]);
  // A late bus stays "next" until it has actually left.
  const upcoming = trips?.filter((t) => new Date(liveOf(t)?.departure ?? t.departure).getTime() > now - 60000).slice(0, 3) ?? [];

  const spin = useSharedValue(0);
  const spinStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));
  function swap() {
    spin.set(withSpring(spin.get() + 180, { damping: 12 }));
    setReversed((v) => !v);
  }

  const open = () => router.push({ pathname: '/route/[id]', params: { id: route.id, reversed: reversed ? '1' : '0' } });

  return (
    <PressableScale style={[styles.card, shadow]} onPress={open}>
      <View style={styles.cardHeader}>
        <Animated.View key={reversed ? 'r' : 'f'} entering={SWAP} style={{ flex: 1, gap: 2 }}>
          <Text style={styles.cardFrom} numberOfLines={1}>{from.name}</Text>
          <Text style={styles.cardTo} numberOfLines={1}>→ {to.name}</Text>
        </Animated.View>
        <PressableScale onPress={swap} hitSlop={8} style={styles.swap}>
          <Animated.Text style={[styles.swapText, spinStyle]}>⇅</Animated.Text>
        </PressableScale>
      </View>

      {alerts.map((a) => (
        <Animated.View key={a.id} entering={CALM} style={[styles.alert, { backgroundColor: severityStyle.high.soft }]}>
          <Text style={[styles.alertText, { color: severityStyle.high.color }]} numberOfLines={1}>⚠️  {a.heading}</Text>
        </Animated.View>
      ))}

      {error && !trips && <ErrorState compact offline={offline} message={error} onRetry={reload} />}
      {trips && (cachedAt || offline) && <StaleNote cachedAt={cachedAt} offline={offline} />}
      {!trips && !error && (
        <View style={{ gap: 8 }}>
          <Skeleton height={52} />
          <Skeleton height={36} />
        </View>
      )}
      {trips && upcoming.length === 0 && <Text style={styles.muted}>No more buses in the next few days.</Text>}

      <View key={`${from.id}-${to.id}`} style={{ gap: 6 }}>
        {upcoming.map((t, i) =>
          i === 0 ? <NextTrip key={t.id} trip={t} now={now} live={liveOf(t)} /> : (
            <Animated.View key={t.id} entering={SWAP} style={styles.trip}>
              <Text style={styles.tripTime}>{formatTime(t.departure)}</Text>
              <Text style={styles.muted}>→ {formatTime(t.arrival)}</Text>
              <DelayBadge live={liveOf(t)} />
              <Text style={styles.tripCountdown}>{formatCountdown(liveOf(t)?.departure ?? t.departure, now)}</Text>
            </Animated.View>
          ),
        )}
      </View>

      <View style={styles.actions}>
        <PressableScale style={styles.actionButton} onPress={() => router.push({ pathname: '/add', params: { edit: route.id } })}>
          <Text style={styles.action}>✎  Edit</Text>
        </PressableScale>
        <PressableScale style={[styles.actionButton, styles.removeButton]} onPress={() => confirmRemove(`${route.from.name} → ${route.to.name}`, onRemove)}>
          <Text style={[styles.action, { color: colors.danger }]}>✕  Remove</Text>
        </PressableScale>
      </View>
    </PressableScale>
  );
}

// Small "+4" / "-2" pill for later trips that already have live data.
function DelayBadge({ live }: { live: LiveSummary | null }) {
  if (!live || live.arrivalDelayMin === null || live.arrivalDelayMin === 0) return null;
  const c = toneColors[live.tone];
  const d = live.arrivalDelayMin;
  return (
    <View style={[styles.delay, { backgroundColor: c.bg }]}>
      <Text style={[styles.delayText, { color: c.fg }]}>{d > 0 ? `+${d}` : d} min</Text>
    </View>
  );
}

// Highlighted next departure with a bar that fills over the final hour.
function NextTrip({ trip, now, live }: { trip: Trip; now: number; live: LiveSummary | null }) {
  const departure = live?.departure ?? trip.departure;
  const minsLeft = (new Date(departure).getTime() - now) / 60000;
  const fill = Math.min(1, Math.max(0.04, 1 - minsLeft / 60));
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.set(withTiming(fill, { duration: 900 }));
  }, [fill, progress]);
  const bar = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  return (
    <Animated.View entering={SWAP} style={styles.next}>
      <View style={styles.nextRow}>
        <PulseDot color={colors.primary} size={8} />
        <Text style={styles.nextTime}>{formatTime(departure)}</Text>
        <Text style={styles.muted}>→ {formatTime(live?.arrival ?? trip.arrival)} · {trip.route}</Text>
        {trip.gate && <GateBadge gate={trip.gate} />}
        <Text style={styles.nextCountdown}>{formatCountdown(departure, now)}</Text>
      </View>
      {live && <LiveStatus summary={live} compact />}
      <View style={styles.track}>
        <Animated.View style={[styles.barWrap, bar]}>
          <LinearGradient colors={[colors.primary, colors.accent]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  gear: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  gearIcon: { color: '#fff', fontSize: 20 },
  greeting: { color: 'rgba(255,255,255,0.75)', fontSize: 15, fontWeight: '500' },
  title: { color: '#fff', fontSize: 30, fontWeight: '800', marginTop: 4, letterSpacing: -0.5 },
  glass: {
    marginTop: 18,
    padding: 16,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    ...(Platform.OS === 'web' ? ({ backdropFilter: 'blur(12px)' } as object) : {}),
  },
  glassTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  glassLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: '500', flexShrink: 1 },
  glassRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 8 },
  countdown: { color: '#fff', fontSize: 44, fontWeight: '800', fontVariant: ['tabular-nums'], letterSpacing: -1 },
  glassTime: { color: '#fff', fontSize: 20, fontWeight: '700' },
  glassLive: { color: '#a7f3d0', fontSize: 13, fontWeight: '600', marginTop: 6 },
  delay: { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 },
  delayText: { fontSize: 12, fontWeight: '700' },
  glassSub: { color: 'rgba(255,255,255,0.7)', fontSize: 13 },
  hint: { color: colors.muted, textAlign: 'center', marginTop: 14, fontSize: 14 },
  teaser: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.card, borderRadius: 20, padding: 18 },
  teaserRail: { alignItems: 'center', height: 54 },
  teaserLine: { flex: 1, width: 2, backgroundColor: colors.border, marginVertical: 3 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  teaserText: { fontSize: 16, color: colors.muted },
  teaserPlus: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  teaserPlusText: { color: '#fff', fontSize: 22, fontWeight: '700' },
  card: { backgroundColor: colors.card, borderRadius: 20, padding: 16, gap: 12 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardFrom: { fontSize: 17, fontWeight: '700', color: colors.text },
  cardTo: { fontSize: 15, color: colors.muted, fontWeight: '500' },
  swap: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  swapText: { fontSize: 22, color: colors.primary, fontWeight: '700' },
  next: { backgroundColor: colors.primarySoft, borderRadius: 14, padding: 12, gap: 10 },
  nextRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  nextTime: { fontSize: 22, fontWeight: '800', color: colors.primary, letterSpacing: -0.3 },
  nextCountdown: { marginLeft: 'auto', color: colors.primary, fontWeight: '700' },
  track: { height: 6, borderRadius: 3, backgroundColor: 'rgba(37,99,235,0.12)', overflow: 'hidden' },
  barWrap: { height: 6, borderRadius: 3, overflow: 'hidden' },
  trip: { flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingHorizontal: 12, paddingVertical: 4 },
  tripTime: { fontSize: 16, fontWeight: '600', color: colors.text, minWidth: 74 },
  tripCountdown: { marginLeft: 'auto', color: colors.muted },
  alert: { borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12 },
  alertText: { fontSize: 13, fontWeight: '700' },
  muted: { color: colors.muted, fontSize: 14 },
  error: { color: colors.danger },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, borderTopWidth: 1, borderColor: colors.border, paddingTop: 12 },
  actionButton: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 12, backgroundColor: colors.bg },
  removeButton: { backgroundColor: '#fff1f3' },
  action: { color: colors.text, fontSize: 14, fontWeight: '600' },
  section: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, paddingHorizontal: 4 },
  sectionTitle: { fontSize: 20, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },
  countPill: { backgroundColor: colors.primarySoft, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  countText: { color: colors.primary, fontWeight: '700', fontSize: 13 },
  sectionHint: { marginLeft: 'auto', color: colors.muted, fontSize: 12 },
});
