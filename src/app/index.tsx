import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
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
import { formatCountdown, formatTime, loadRoutes, saveRoutes, useAdvisories, useNow } from '@/api';
import { useDirection } from '@/direction';
import { severityStyle } from '@/components/Advisories';
import { ErrorState, StaleNote } from '@/components/ErrorState';
import { GateBadge } from '@/components/GateBadge';
import { InstallCard } from '@/components/InstallCard';
import { finishNudge, useFirstRun } from '@/firstRun';
import { CarrierTag } from '@/components/CarrierTag';
import { LiveStatus, toneColors } from '@/components/LiveStatus';
import { MyAlarms } from '@/components/MyAlarms';
import { statusKey, summarize, useTripStatuses, type LiveSummary } from '@/live';
import { RoutePlanner } from '@/components/RoutePlanner';
import { RouteBadge } from '@/components/RouteBadge';
import { FilterButton } from '@/components/FilterButton';
import { RouteChips } from '@/components/RouteChips';
import { chosenTrips, offerLabel, routeChoices, soonerHidden } from '@/routeFilter';
import { usePartner, useRouteTrips } from '@/routeTrips';
import type { SavedRoute, Stop, Trip } from '@/types';
import { Collapsible, colors, EASE_OUT, gradient, Hero, Page, PressableScale, PulseDot, shadow, Skeleton } from '@/ui';
import { routeProps, track, trackRouteChange } from '@/analytics';
import { detourLine, detoursNear, isDetour, routeStops } from '@/detours';
import { formatHour, rainDuring, SKY, useWeather } from '@/weather';

// Home stays calm: one short fade, no slides or staggers.
const CALM = FadeIn.duration(250).easing(EASE_OUT);
const SWAP = FadeIn.duration(200).easing(EASE_OUT);
// Longest the next-bus card may show its loading placeholder.
const HERO_LOADING_MS = 8000;

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
  const firstRun = useFirstRun();

  useFocusEffect(
    useCallback(() => {
      loadRoutes().then(setRoutes);
    }, []),
  );

  async function update(next: SavedRoute[]) {
    setRoutes(next);
    await saveRoutes(next);
  }

  function addFirst(from: Stop, to: Stop) {
    const route = { id: String(Date.now()), from, to };
    track('route_added', { ...routeProps(route), first: true });
    return update([route]);
  }

  return (
    <>
      <Page
        refreshable
        overlap={!routes?.length}
        hero={
          <Hero overlap={!routes?.length}>
            <View style={styles.heroTop}>
              <Animated.Text style={styles.greeting}>{greeting} 👋</Animated.Text>
              <View style={styles.heroTopRight}>
                {routes?.[0] && <TodaySky route={routes[0]} />}
                {/* Settings are all for the wake-up alarm, which needs the iPhone app; the website hides them. */}
                {Platform.OS !== 'web' && (
                  <PressableScale onPress={() => router.push('/settings')} hitSlop={10} style={styles.gear}>
                    <Text style={styles.gearIcon}>⚙︎</Text>
                  </PressableScale>
                )}
              </View>
            </View>
            {routes?.[0] ? (
              <NextBusHero route={routes[0]} />
            ) : (
              routes && <Animated.Text style={styles.title}>{"Let's add your first route"}</Animated.Text>
            )}
          </Hero>
        }
      >
        {routes?.length === 0 && firstRun && (
          <Animated.View entering={CALM}>
            <RoutePlanner
              onSave={addFirst}
              saveLabel="Save my route"
              nudge={firstRun.nudge ? (firstRun.welcome ? 'waiting' : 'now') : undefined}
              onNudged={finishNudge}
            />
            <Text style={styles.hint}>Save once - see it later.</Text>
          </Animated.View>
        )}

        {Platform.OS === 'ios' && !!routes?.length && (
          <Animated.View entering={CALM}>
            <MyAlarms />
          </Animated.View>
        )}

        {!!routes?.length && (
          <Animated.View entering={CALM} style={styles.section}>
            <Text style={styles.sectionTitle}>My routes</Text>
            <View style={styles.countPill}>
              <Text style={styles.countText}>{routes.length}</Text>
            </View>
            <PressableScale onPress={() => router.push('/add')} hitSlop={6} style={styles.addButton}>
              <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.addGradient}>
                <Text style={styles.addText}>＋ Add route</Text>
              </LinearGradient>
            </PressableScale>
          </Animated.View>
        )}

        {routes?.map((r, i) => (
          <Animated.View
            key={r.id}
            entering={CALM}
            exiting={FadeOut.duration(150)}
            layout={LinearTransition.duration(250).easing(EASE_OUT)}
          >
            <RouteCard
              route={r}
              onChange={(changed) => {
                trackRouteChange(r, changed, 'home');
                update(routes.map((x) => (x.id === r.id ? changed : x)));
              }}
              onRemove={() => {
                track('route_removed', routeProps(r));
                update(routes.filter((x) => x.id !== r.id));
              }}
            />
          </Animated.View>
        ))}

        {!!routes?.length && <InstallCard />}
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

// Today's weather in the town the rider is leaving from ("☁️ Cloudy in Tenafly"), beside the greeting.
function TodaySky({ route }: { route: SavedRoute }) {
  const { from } = useDirection(route);
  const sky = useWeather(from)?.today;
  if (!sky) return null;
  const place = from.town || from.name;
  return (
    <Animated.Text entering={CALM} style={styles.sky} numberOfLines={1}>
      {`${SKY[sky].icon} ${SKY[sky].label} in ${place}`}
    </Animated.Text>
  );
}

// Live h:mm:ss countdown to the very next bus on the first saved route, in the direction the rider is likely headed.
// Owns the hero title too: with nothing to count down to (failed load, no buses left) it says so instead of
// promising a "next bus" over an empty space.
function NextBusHero({ route }: { route: SavedRoute }) {
  const { from, to, reversed } = useDirection(route);
  const { trips: all, error } = useRouteTrips(route, reversed);
  const trips = useMemo(() => chosenTrips(all, route), [all, route]);
  const now = useNow(1000);
  // Whatever goes wrong while loading, the placeholder doesn't outstay its welcome: the route cards below
  // have the same trips (and any error) anyway.
  // Keyed by direction, so flipping direction gives the new one its own full wait.
  const direction = `${from.id}>${to.id}`;
  const [gaveUpOn, setGaveUpOn] = useState<string | null>(null);
  const loading = !trips;
  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => setGaveUpOn(direction), HERO_LOADING_MS);
    return () => clearTimeout(timer);
  }, [loading, direction]);
  const loadingTooLong = gaveUpOn === direction;
  const statuses = useTripStatuses(trips, now);
  const liveOf = (t: Trip) => summarize(statuses[statusKey(t)], now);
  const next = trips?.find((t) => new Date(liveOf(t)?.departure ?? t.departure).getTime() > now);
  const live = next ? liveOf(next) : null;
  const sooner = next ? soonerHidden(all, route.only, live?.departure ?? next.departure, now) : null;
  // Rain at either end while riding the next bus.
  const weather = [useWeather(from), useWeather(to)];
  const rain = next ? rainDuring(weather, live?.departure ?? next.departure, live?.arrival ?? next.arrival) : null;

  // A failed load with nothing cached would otherwise leave the skeleton up for good; the route card shows the error.
  if (!trips && (error || loadingTooLong)) return <Animated.Text style={styles.title}>Your buses</Animated.Text>;
  if (!trips) {
    return (
      <>
        <Animated.Text style={styles.title}>Your next bus</Animated.Text>
        <Skeleton height={88} style={{ marginTop: 16, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20 }} />
      </>
    );
  }
  if (!next) return <Animated.Text style={styles.title}>Your buses</Animated.Text>;

  const departure = live?.departure ?? next.departure;
  const openMap = () =>
    router.push({ pathname: '/map', params: { route: route.id, reversed: reversed ? '1' : '0', trip: next.id } });
  const secs = Math.max(0, Math.floor((new Date(departure).getTime() - now) / 1000));
  const hh = Math.floor(secs / 3600);
  const mm = String(Math.floor((secs % 3600) / 60)).padStart(2, '0');
  const ss = String(secs % 60).padStart(2, '0');

  return (
    <>
      <Animated.Text style={styles.title}>Your next bus</Animated.Text>
      <Animated.View entering={CALM} style={styles.glass}>
        <View style={styles.glassTop}>
          <PulseDot color="#34d399" />
          <Text style={styles.glassLabel}>{from.town || from.name} → {to.town || to.name} · {next.route}</Text>
          {Platform.OS !== 'android' && (
            <PressableScale onPress={openMap} hitSlop={8} style={styles.mapButton}>
              <Text style={styles.mapText}>🗺  Map</Text>
            </PressableScale>
          )}
        </View>
        {live && <Text style={styles.glassLive} numberOfLines={1}>{live.text}</Text>}
        <View style={styles.glassRow}>
          <Text style={styles.countdown}>{hh > 0 ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`}</Text>
          <View style={styles.glassWhen}>
            <Text style={styles.glassTime}>{formatTime(departure)}</Text>
            <Text style={styles.glassSub}>{next.gate ? `Gate ${next.gate} · ` : ''}arrives {formatTime(live?.arrival ?? next.arrival)}</Text>
          </View>
        </View>
        {rain && <Text style={styles.glassRain} numberOfLines={2}>{`☔ Rain likely around ${formatHour(rain)}, bring an umbrella`}</Text>}
        {sooner && <Text style={styles.glassSooner} numberOfLines={1}>{`A ${sooner.route} leaves sooner, at ${formatTime(sooner.departure)}`}</Text>}
      </Animated.View>
    </>
  );
}

// Carriers often file a detour as a minor notice (NJ Transit's 166 Tenafly detour was), but it changes where
// to wait for the bus, so the home card shows it whatever its severity.
function RouteCard({ route, onChange, onRemove }: { route: SavedRoute; onChange: (route: SavedRoute) => void; onRemove: () => void }) {
  const [reversed, setReversed] = useState(false);
  // The line chips stay folded away behind the Filter button until asked for.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const from = reversed ? route.to : route.from;
  const to = reversed ? route.from : route.to;
  const { trips: all, error, offline, cachedAt, reload, legs } = useRouteTrips(route, reversed);
  const partner = usePartner(route);
  const trips = useMemo(() => chosenTrips(all, route), [all, route]);
  // Each bus's route (166 or 166X) only matters when more than one could show up.
  const routes = routeChoices(all, route.only);
  const showRoute = routes.length > 0 && route.only?.length !== 1;
  // Route choices were made among the old set of buses, so they start over when the other carrier is added.
  const offer = !route.also && partner ? { label: offerLabel(partner), onPress: () => onChange({ ...route, also: partner, only: undefined }) } : null;
  // Each carrier's alerts come from its own trips.
  const advisories = [...useAdvisories(legs[0]), ...useAdvisories(legs[1])];
  // Detours first, saying when one is by the rider's stop; then any other serious alert.
  const detours = detoursNear(advisories, routeStops(route));
  const alerts = advisories.filter((a) => a.severity === 'high' && !isDetour(a));
  const now = useNow();
  const statuses = useTripStatuses(trips, now);
  const liveOf = (t: Trip) => summarize(statuses[statusKey(t)], now);
  // A late bus stays "next" until it has actually left.
  const upcoming = trips?.filter((t) => new Date(liveOf(t)?.departure ?? t.departure).getTime() > now - 60000).slice(0, 3) ?? [];
  const sooner = upcoming[0] ? soonerHidden(all, route.only, liveOf(upcoming[0])?.departure ?? upcoming[0].departure, now) : null;

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
          <View style={styles.tags}>
            <CarrierTag stop={route.from} />
            {route.also && <CarrierTag stop={route.also.from} onRemove={() => onChange({ ...route, also: undefined, only: undefined })} />}
            {(routes.length > 0 || offer) && <FilterButton only={route.only} open={filtersOpen} onPress={() => setFiltersOpen((v) => !v)} />}
          </View>
        </Animated.View>
        <PressableScale onPress={swap} hitSlop={8} style={styles.swap}>
          <Animated.Text style={[styles.swapText, spinStyle]}>⇅</Animated.Text>
        </PressableScale>
      </View>

      <Collapsible expanded={filtersOpen} gap={12}>
        <RouteChips trips={all} only={route.only} onChange={(only) => onChange({ ...route, only })} offer={offer} />
      </Collapsible>

      {detours.map((d) => (
        <Animated.View key={d.advisory.id} entering={CALM} style={[styles.alert, { backgroundColor: severityStyle.high.soft }]}>
          <Text style={[styles.alertText, { color: severityStyle.high.color }]} numberOfLines={2}>{`↪️\u00A0 ${detourLine(d)}`}</Text>
          {d.near && <Text style={styles.alertDetail} numberOfLines={3}>{[d.advisory.heading, ...d.advisory.paragraphs].join(' ')}</Text>}
        </Animated.View>
      ))}
      {alerts.map((a) => (
        <Animated.View key={a.id} entering={CALM} style={[styles.alert, { backgroundColor: severityStyle.high.soft }]}>
          <Text style={[styles.alertText, { color: severityStyle.high.color }]} numberOfLines={1}>{`⚠️\u00A0 ${a.heading}`}</Text>
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
      {trips && upcoming.length === 0 && (
        <Text style={styles.muted}>No more {route.only?.length ? `${route.only.join(' or ')} ` : ''}buses in the next few days.</Text>
      )}

      <View key={`${from.id}-${to.id}`} style={{ gap: 6 }}>
        {upcoming.map((t, i) =>
          i === 0 ? <NextTrip key={t.id} trip={t} now={now} live={liveOf(t)} routes={showRoute ? routes : null} sooner={sooner} onShowAll={() => onChange({ ...route, only: undefined })} /> : (
            <Animated.View key={t.id} entering={SWAP} style={styles.trip}>
              <Text style={styles.tripTime}>{formatTime(t.departure)}</Text>
              <Text style={styles.muted} numberOfLines={1}>→ {formatTime(t.arrival)}</Text>
              {showRoute && <RouteBadge trip={t} routes={routes} />}
              {t.gate && <GateBadge gate={t.gate} />}
              <DelayBadge live={liveOf(t)} />
              <Text style={styles.tripCountdown} numberOfLines={1}>{formatCountdown(liveOf(t)?.departure ?? t.departure, now)}</Text>
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
// routes: every route showing, when the bus's own should be labeled. sooner: a bus the rider's line choice hides
// that leaves first, named in the row's spare space (tapping it shows every line).
function NextTrip(props: { trip: Trip; now: number; live: LiveSummary | null; routes: string[] | null; sooner?: Trip | null; onShowAll?: () => void }) {
  const { trip, now, live, routes, sooner, onShowAll } = props;
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
        <Text style={styles.muted} numberOfLines={1}>→ {formatTime(live?.arrival ?? trip.arrival)}</Text>
        {routes && <RouteBadge trip={trip} routes={routes} />}
        {trip.gate && <GateBadge gate={trip.gate} />}
        {sooner && (
          <PressableScale onPress={onShowAll} hitSlop={6} accessibilityRole="button" accessibilityLabel={`A ${sooner.route} leaves sooner, at ${formatTime(sooner.departure)}. Show all lines`} style={styles.sooner}>
            <Text style={styles.soonerText} numberOfLines={1}>{`${sooner.route} · ${formatTime(sooner.departure)} is sooner`}</Text>
          </PressableScale>
        )}
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
  heroTopRight: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1, marginLeft: 12 },
  sky: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '600', flexShrink: 1 },
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
  // The departure time wraps under the countdown on narrow screens instead of spilling out of the card.
  glassRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', columnGap: 12, marginTop: 8 },
  glassWhen: { alignItems: 'flex-end', marginLeft: 'auto' },
  countdown: { color: '#fff', fontSize: 44, fontWeight: '800', fontVariant: ['tabular-nums'], letterSpacing: -1 },
  glassTime: { color: '#fff', fontSize: 20, fontWeight: '700' },
  glassLive: { color: '#a7f3d0', fontSize: 13, fontWeight: '600', marginTop: 6 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  delay: { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 },
  delayText: { fontSize: 12, fontWeight: '700' },
  mapButton: { marginLeft: 'auto', borderRadius: 12, paddingVertical: 6, paddingHorizontal: 12, backgroundColor: 'rgba(255,255,255,0.18)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  mapText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  glassRain: { color: '#bfdbfe', fontSize: 13, fontWeight: '600', marginTop: 8 },
  glassSooner: { color: '#fde68a', fontSize: 13, fontWeight: '600', marginTop: 8 },
  glassSub: { color: 'rgba(255,255,255,0.7)', fontSize: 13 },
  hint: { color: colors.muted, textAlign: 'center', marginTop: 14, fontSize: 14 },
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
  sooner: { flexShrink: 1, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: colors.card },
  soonerText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  track: { height: 6, borderRadius: 3, backgroundColor: 'rgba(37,99,235,0.12)', overflow: 'hidden' },
  barWrap: { height: 6, borderRadius: 3, overflow: 'hidden' },
  // On narrow screens the gate and countdown wrap to a second line rather than squeezing the times.
  trip: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8, rowGap: 4, paddingHorizontal: 12, paddingVertical: 4 },
  tripTime: { fontSize: 16, fontWeight: '600', color: colors.text, minWidth: 74 },
  tripCountdown: { marginLeft: 'auto', color: colors.muted, flexShrink: 0 },
  alert: { borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12 },
  alertText: { fontSize: 13, fontWeight: '700' },
  alertDetail: { fontSize: 12, color: colors.text, marginTop: 4, lineHeight: 17 },
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
  addButton: { marginLeft: 'auto' },
  addGradient: { borderRadius: 16, paddingVertical: 7, paddingHorizontal: 14 },
  addText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
