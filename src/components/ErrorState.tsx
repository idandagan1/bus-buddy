import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { formatTime } from '@/api';
import { colors, PressableScale } from '@/ui';

// Shown when there's nothing to display: no connection or Coach USA failed, and nothing saved.
export function ErrorState({ offline, message, onRetry, compact }: { offline: boolean; message?: string | null; onRetry: () => void; compact?: boolean }) {
  return (
    <Animated.View entering={FadeIn.duration(250)} style={[styles.box, compact && styles.compact]}>
      <Text style={[styles.icon, compact && styles.iconCompact]}>{offline ? '📡' : '⚠️'}</Text>
      <Text style={styles.title}>{offline ? 'No internet connection' : "Couldn't load data"}</Text>
      <Text style={styles.body}>
        {offline
          ? "Connect to Wi-Fi or mobile data. We'll refresh automatically when you're back online."
          : (message ?? 'Coach USA is not responding right now.') + ' Try again in a moment.'}
      </Text>
      <PressableScale onPress={onRetry} style={styles.retry}>
        <Text style={styles.retryText}>Try again</Text>
      </PressableScale>
    </Animated.View>
  );
}

// "Saved schedule from 7:02 AM" — shown while displaying an older copy.
export function StaleNote({ cachedAt, offline }: { cachedAt: number | null; offline: boolean }) {
  if (!cachedAt && !offline) return null;
  const when = cachedAt ? formatSaved(cachedAt) : null;
  return (
    <View style={styles.stale}>
      <Text style={styles.staleText}>
        {offline ? '📡 Offline · ' : '↻ '}
        {when ? `Showing saved schedule from ${when}` : 'Showing saved schedule'}
      </Text>
    </View>
  );
}

function formatSaved(ms: number) {
  const time = formatTime(new Date(ms).toISOString());
  const sameDay = new Date(ms).toDateString() === new Date().toDateString();
  return sameDay ? time : `${new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${time}`;
}

const styles = StyleSheet.create({
  box: { backgroundColor: colors.card, borderRadius: 20, padding: 24, alignItems: 'center', gap: 8 },
  compact: { padding: 14, borderRadius: 14, backgroundColor: colors.bg },
  icon: { fontSize: 36 },
  iconCompact: { fontSize: 24 },
  title: { fontSize: 17, fontWeight: '700', color: colors.text, textAlign: 'center' },
  body: { fontSize: 14, color: colors.muted, textAlign: 'center', lineHeight: 20 },
  retry: { marginTop: 6, backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 20 },
  retryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  stale: { backgroundColor: '#fff7ed', borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10, alignSelf: 'flex-start' },
  staleText: { color: '#9a3412', fontSize: 12, fontWeight: '600' },
});
