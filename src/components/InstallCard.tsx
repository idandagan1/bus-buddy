import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { handoffRoutesForIos, useInstall } from '@/install';
import { colors, PressableScale, shadow } from '@/ui';

// A card offering to put the web app on the home screen. Native and already-installed apps never show it.
export function InstallCard() {
  const { mode, steps: guide, install, dismiss } = useInstall();
  const [steps, setSteps] = useState(false);
  if (!mode) return null;

  function add() {
    if (mode === 'prompt') return install();
    handoffRoutesForIos();
    setSteps(true);
  }

  return (
    <Animated.View entering={FadeIn.duration(250)} style={[styles.card, shadow]}>
      <View style={styles.row}>
        <Text style={styles.icon}>📲</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Add Bus Buddy to your Home Screen</Text>
          <Text style={styles.body}>Opens like an app, one tap away.</Text>
        </View>
        <PressableScale onPress={dismiss} hitSlop={10} accessibilityLabel="Not now">
          <Text style={styles.close}>✕</Text>
        </PressableScale>
      </View>
      {steps ? (
        <View style={styles.steps}>
          {guide.map((step, i) => (
            <Text key={i} style={styles.step}>{i + 1}. {step}</Text>
          ))}
        </View>
      ) : (
        <PressableScale onPress={add} style={styles.button}>
          <Text style={styles.buttonText}>{mode === 'prompt' ? 'Install' : 'Show me how'}</Text>
        </PressableScale>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: 18, padding: 14, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { fontSize: 26 },
  title: { color: colors.text, fontSize: 15, fontWeight: '700' },
  body: { color: colors.muted, fontSize: 13, marginTop: 2 },
  close: { color: colors.muted, fontSize: 16, padding: 4 },
  button: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  steps: { backgroundColor: colors.primarySoft, borderRadius: 12, padding: 12, gap: 6 },
  step: { color: colors.text, fontSize: 14, lineHeight: 20 },
});
