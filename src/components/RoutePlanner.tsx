import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { OfflineError, searchStops } from '@/api';
import { CarrierTag } from '@/components/CarrierTag';
import { ErrorState } from '@/components/ErrorState';
import type { Stop } from '@/types';
import { colors, EASE_OUT, gradient, PressableScale, shadow } from '@/ui';

type Field = 'from' | 'to';

// From/To search card. Destinations are limited to stops reachable from the chosen origin.
// `nudge` points a first-time user at From instead of opening the keyboard on it: 'waiting' while the
// welcome scene still covers the screen, 'now' once it's gone. Tapping From calls onNudged.
export function RoutePlanner(props: {
  initialFrom?: Stop;
  initialTo?: Stop;
  saveLabel?: string;
  nudge?: 'waiting' | 'now';
  onNudged?: () => void;
  onSave: (from: Stop, to: Stop) => void;
}) {
  const [from, setFrom] = useState<Stop | null>(props.initialFrom ?? null);
  const [to, setTo] = useState<Stop | null>(props.initialTo ?? null);
  const [active, setActive] = useState<Field | null>(props.initialFrom || props.nudge ? null : 'from');
  const [query, setQuery] = useState('');

  function pick(stop: Stop) {
    setQuery('');
    if (active === 'from') {
      setFrom(stop);
      if (to?.id === stop.id) setTo(null);
      setActive(to ? null : 'to');
    } else {
      setTo(stop);
      setActive(null);
    }
  }

  const spin = useSharedValue(0);
  const spinStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));
  function swap() {
    spin.set(withSpring(spin.get() + 180, { damping: 12 }));
    setFrom(to);
    setTo(from);
    setQuery('');
    // The field being typed in follows the swap; with no origin left, ask for one (To needs it to search).
    setActive(!to ? 'from' : active === 'from' ? 'to' : active === 'to' ? 'from' : null);
  }

  function edit(field: Field) {
    if (field === 'to' && !from) return;
    if (field === 'from' && props.nudge) props.onNudged?.();
    setQuery('');
    setActive(field);
  }

  return (
    <View style={styles.wrap}>
      <View style={[styles.card, shadow]}>
        <View style={styles.rail}>
          <View style={[styles.railDot, { backgroundColor: colors.primary }]} />
          <View style={styles.railLine} />
          <View style={[styles.railDot, styles.railDotEnd]} />
        </View>
        <View style={{ flex: 1 }}>
          <View>
            {props.nudge === 'now' && <NudgeRing />}
            <FieldRow label="From" stop={from} placeholder="Stop, town, or stop #" active={active === 'from'} query={query} onQuery={setQuery} onPress={() => edit('from')} />
          </View>
          <View style={styles.divider} />
          <FieldRow
            label="To"
            stop={to}
            placeholder="Where to, buddy?"
            active={active === 'to'}
            disabled={!from}
            query={query}
            onQuery={setQuery}
            onPress={() => edit('to')}
          />
        </View>
        <PressableScale onPress={swap} disabled={!from && !to} style={[styles.swap, !from && !to && { opacity: 0.4 }]} accessibilityLabel="Swap from and to">
          <Animated.Text style={[styles.swapIcon, spinStyle]}>⇅</Animated.Text>
        </PressableScale>
      </View>

      {props.nudge === 'now' && <NudgeTip />}

      {active && <Results key={`${active}:${from?.id ?? ''}`} query={query} origin={active === 'to' ? from?.id : undefined} onPick={pick} />}

      {from && to && !active && (
        <Animated.View entering={FadeIn.duration(250).easing(EASE_OUT)}>
          <PressableScale onPress={() => props.onSave(from, to)}>
            <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.save}>
              <Text style={styles.saveText}>{props.saveLabel ?? 'Save route'}  →</Text>
            </LinearGradient>
          </PressableScale>
        </Animated.View>
      )}
    </View>
  );
}

// A soft ring breathing around From, so a first-time user knows where to start.
function NudgeRing() {
  const still = useReducedMotion();
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (!still) pulse.set(withRepeat(withSequence(withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 900, easing: Easing.in(Easing.quad) })), -1));
  }, [still, pulse]);
  const style = useAnimatedStyle(() => ({ opacity: 0.45 + pulse.get() * 0.55, transform: [{ scale: 1 + pulse.get() * 0.025 }] }));
  return <Animated.View entering={FadeIn.duration(500)} exiting={FadeOut.duration(200)} pointerEvents="none" style={[styles.ring, style]} />;
}

function NudgeTip() {
  const still = useReducedMotion();
  const bob = useSharedValue(0);
  useEffect(() => {
    if (!still) bob.set(withRepeat(withSequence(withTiming(-5, { duration: 600, easing: Easing.inOut(Easing.sin) }), withTiming(0, { duration: 600, easing: Easing.inOut(Easing.sin) })), -1));
  }, [still, bob]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: bob.get() }] }));
  return (
    <Animated.View entering={FadeInDown.delay(300).duration(500)} exiting={FadeOut.duration(200)} style={[styles.tipWrap, style]} pointerEvents="none">
      <View style={styles.tipArrow} />
      <View style={styles.tip}>
        <Text style={styles.tipText}>👆 Start here: where do you catch the bus?</Text>
      </View>
    </Animated.View>
  );
}

// NJ Transit stops have no town; their stop number (on the sign at the stop) tells them apart instead.
// Their route numbers tell Port Authority's NJ Transit gates from Coach USA's (166 vs 20, say).
const stopPlace = (s: Stop) => {
  if (s.carrier !== 'NJT') return `${s.town}, ${s.state}`;
  const place = s.code ? `Stop #${s.code}` : 'NJ Transit bus';
  return s.routes?.length ? `${place} · ${s.routes.length === 1 ? 'Bus' : 'Buses'} ${s.routes.join(', ')}` : place;
};

function FieldRow(props: {
  label: string;
  stop: Stop | null;
  placeholder: string;
  active: boolean;
  disabled?: boolean;
  query: string;
  onQuery: (q: string) => void;
  onPress: () => void;
}) {
  return (
    <PressableScale onPress={props.onPress} disabled={props.disabled} style={[styles.field, props.active && styles.fieldActive]}>
      <Text style={styles.fieldLabel}>{props.label}</Text>
      {props.active ? (
        <TextInput
          autoFocus
          style={styles.input}
          placeholder={props.stop ? props.stop.name : props.placeholder}
          placeholderTextColor={colors.muted}
          value={props.query}
          onChangeText={props.onQuery}
        />
      ) : props.stop ? (
        <View style={styles.picked}>
          <View style={{ flex: 1 }}>
            <Text style={styles.stopName} numberOfLines={1}>{props.stop.name}</Text>
            <Text style={styles.stopTown} numberOfLines={1}>{stopPlace(props.stop)}</Text>
          </View>
          <CarrierTag stop={props.stop} />
        </View>
      ) : (
        <Text style={[styles.placeholder, props.disabled && { opacity: 0.5 }]}>{props.placeholder}</Text>
      )}
    </PressableScale>
  );
}

function Results({ query, origin, onPick }: { query: string; origin?: string; onPick: (s: Stop) => void }) {
  const [results, setResults] = useState<Stop[] | null>(null);
  const [error, setError] = useState<{ message: string; offline: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      searchStops(query, origin)
        .then((r) => {
          setResults(r);
          setError(null);
        })
        .catch((e) => setError({ message: e.message, offline: e instanceof OfflineError }));
    }, 250);
    return () => clearTimeout(timer);
  }, [query, origin, attempt]);

  if (error) return <ErrorState compact offline={error.offline} message={error.message} onRetry={() => setAttempt((n) => n + 1)} />;
  if (!results) return <ActivityIndicator color={colors.primary} style={{ marginTop: 12 }} />;
  if (!results.length) return <Text style={styles.empty}>No stops match “{query}”.</Text>;

  return (
    <View style={styles.results}>
      {results.slice(0, 25).map((s) => (
        <Animated.View key={s.id} entering={FadeIn.duration(150)}>
          <PressableScale style={styles.result} onPress={() => onPick(s)}>
            <View style={styles.pin}>
              <Text style={styles.pinText}>●</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.resultName}>{s.name}</Text>
              <Text style={styles.stopTown} numberOfLines={2}>{stopPlace(s)}</Text>
            </View>
            <View>
              <CarrierTag stop={s} />
            </View>
          </PressableScale>
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 16 },
  card: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: 20, padding: 12, paddingLeft: 18, gap: 10 },
  rail: { alignItems: 'center', paddingVertical: 30 },
  railDot: { width: 12, height: 12, borderRadius: 6 },
  railDotEnd: { backgroundColor: colors.accent, borderRadius: 3 },
  railLine: { flex: 1, width: 2, backgroundColor: colors.border, marginVertical: 4 },
  swap: { alignSelf: 'center', width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  swapIcon: { color: colors.primary, fontSize: 20, fontWeight: '700' },
  divider: { height: 1, backgroundColor: colors.border, marginHorizontal: 12, marginVertical: 4 },
  field: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, minHeight: 68, justifyContent: 'center' },
  fieldActive: { backgroundColor: colors.primarySoft },
  ring: { position: 'absolute', top: -2, left: -2, right: -2, bottom: -2, borderRadius: 16, borderWidth: 2.5, borderColor: colors.primary, backgroundColor: colors.primarySoft },
  tipWrap: { alignSelf: 'flex-start', marginTop: -6, marginLeft: 36 },
  tipArrow: { marginLeft: 22, width: 0, height: 0, borderLeftWidth: 8, borderRightWidth: 8, borderBottomWidth: 8, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: colors.primary },
  tip: { backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  tipText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: colors.muted, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 2 },
  input: { fontSize: 17, color: colors.text, paddingVertical: 2, outlineStyle: 'none' } as never,
  picked: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stopName: { fontSize: 17, fontWeight: '600', color: colors.text },
  stopTown: { fontSize: 13, color: colors.muted },
  placeholder: { fontSize: 17, color: colors.muted },
  results: { gap: 10, paddingBottom: 24 },
  result: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.card, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16, borderWidth: 1, borderColor: colors.border },
  pin: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  pinText: { color: colors.primary, fontSize: 12 },
  resultName: { fontSize: 16, fontWeight: '500', color: colors.text },
  save: { borderRadius: 16, paddingVertical: 18, alignItems: 'center' },
  saveText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  error: { color: colors.danger, textAlign: 'center' },
  empty: { color: colors.muted, textAlign: 'center', marginTop: 8 },
});
