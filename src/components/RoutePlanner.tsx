import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { OfflineError, searchStops } from '@/api';
import { CarrierTag } from '@/components/CarrierTag';
import { ErrorState } from '@/components/ErrorState';
import type { Stop } from '@/types';
import { colors, EASE_OUT, gradient, PressableScale, shadow } from '@/ui';

type Field = 'from' | 'to';

// From/To search card. Destinations are limited to stops reachable from the chosen origin.
export function RoutePlanner(props: { initialFrom?: Stop; initialTo?: Stop; saveLabel?: string; onSave: (from: Stop, to: Stop) => void }) {
  const [from, setFrom] = useState<Stop | null>(props.initialFrom ?? null);
  const [to, setTo] = useState<Stop | null>(props.initialTo ?? null);
  const [active, setActive] = useState<Field | null>(props.initialFrom ? null : 'from');
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

  function edit(field: Field) {
    if (field === 'to' && !from) return;
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
          <FieldRow label="From" stop={from} placeholder="Search a stop or town" active={active === 'from'} query={query} onQuery={setQuery} onPress={() => edit('from')} />
          <View style={styles.divider} />
          <FieldRow
            label="To"
            stop={to}
            placeholder={from ? 'Where are you going?' : 'Choose where you start first'}
            active={active === 'to'}
            disabled={!from}
            query={query}
            onQuery={setQuery}
            onPress={() => edit('to')}
          />
        </View>
      </View>

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

// NJ Transit stops have no town, so say whose stop it is instead.
const stopPlace = (s: Stop) => (s.carrier === 'NJT' ? 'NJ Transit bus' : `${s.town}, ${s.state}`);

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
        <View>
          <Text style={styles.stopName} numberOfLines={1}>{props.stop.name}</Text>
          <Text style={styles.stopTown}>{stopPlace(props.stop)}</Text>
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
              {s.carrier !== 'NJT' && <Text style={styles.stopTown}>{stopPlace(s)}</Text>}
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
  divider: { height: 1, backgroundColor: colors.border, marginHorizontal: 12, marginVertical: 4 },
  field: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, minHeight: 68, justifyContent: 'center' },
  fieldActive: { backgroundColor: colors.primarySoft },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: colors.muted, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 2 },
  input: { fontSize: 17, color: colors.text, paddingVertical: 2, outlineStyle: 'none' } as never,
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
