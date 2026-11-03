import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { BACKUP_OPTIONS_MIN, RADII_M, TONES, useSettings, type ToneId } from '@/settings';
import { colors, Hero, Page, PressableScale, PulseDot, shadow } from '@/ui';

const formatKm = (m: number) => (m < 1000 ? `${m} m` : `${m / 1000} km`);

export default function SettingsScreen() {
  const [settings, update] = useSettings();
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const [previewing, setPreviewing] = useState<ToneId | null>(null);
  const playing = previewing !== null && status.playing;

  useEffect(() => {
    // Previews should be audible even with the silent switch on, like the real alarm.
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  }, []);

  function preview(id: ToneId) {
    const tone = TONES.find((t) => t.id === id)!;
    if (playing && previewing === id) {
      player.pause();
      setPreviewing(null);
      return;
    }
    if (!tone.source) return;
    player.replace(tone.source);
    player.seekTo(0);
    player.play();
    setPreviewing(id);
  }

  function choose(id: ToneId) {
    update({ tone: id });
    preview(id);
  }

  return (
    <Page
      hero={
        <Hero>
          <Text style={styles.back} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>‹ Back</Text>
          <Animated.Text entering={FadeInDown.duration(400)} style={styles.title}>Wake-up settings</Animated.Text>
        </Hero>
      }
    >
      {Platform.OS === 'web' && (
        <Text style={styles.note}>The wake-up alarm runs in the iPhone app. You can preview tones here.</Text>
      )}

      <Section title="Alert style" delay={60}>
        <Chips
          options={[0, 1]}
          value={settings ? Number(settings.vibrateOnly) : undefined}
          label={(v) => (v ? 'Vibration only' : 'Sound + vibration')}
          onChange={(v) => update({ vibrateOnly: v === 1 })}
        />
        <Text style={styles.hint}>Alarms vibrate with the sound as long as Haptics is on in iPhone Settings → Sounds & Haptics.</Text>
      </Section>

      <View style={settings?.vibrateOnly ? styles.dimmed : null} pointerEvents={settings?.vibrateOnly ? 'none' : 'auto'}>
      <Section title="Alarm tone" delay={80}>
        {TONES.map((t) => {
          const selected = settings?.tone === t.id;
          const isPlaying = playing && previewing === t.id;
          return (
            <PressableScale key={t.id} onPress={() => choose(t.id)} style={[styles.tone, selected && styles.toneSelected]}>
              <View style={[styles.radio, selected && styles.radioOn]}>{selected && <View style={styles.radioDot} />}</View>
              <View style={{ flex: 1 }}>
                <Text style={styles.toneName}>{t.name}</Text>
                <Text style={styles.toneDesc}>{t.description}</Text>
              </View>
              {t.source ? (
                <PressableScale onPress={() => preview(t.id)} hitSlop={8} style={[styles.play, isPlaying && styles.playOn]}>
                  {isPlaying ? <PulseDot color="#fff" size={8} /> : <Text style={styles.playIcon}>▶</Text>}
                </PressableScale>
              ) : (
                <Text style={styles.toneDesc}>no preview</Text>
              )}
            </PressableScale>
          );
        })}
      </Section>
      </View>

      <Section title="Ring when the bus is within" delay={160}>
        <Chips options={RADII_M} value={settings?.radiusM} label={formatKm} onChange={(radiusM) => update({ radiusM })} />
        <Text style={styles.hint}>Bigger gives you more time to wake up; smaller rings closer to your stop.</Text>
      </Section>

      <Section title="Backup alarm" delay={240}>
        <Chips
          options={BACKUP_OPTIONS_MIN}
          value={settings?.backupMin}
          label={(m) => (m === 0 ? 'Off' : `${m} min before`)}
          onChange={(backupMin) => update({ backupMin })}
        />
        <Text style={styles.hint}>Rings at the scheduled arrival time minus this, in case GPS misses your stop.</Text>
      </Section>
    </Page>
  );
}

function Section({ title, delay, children }: { title: string; delay: number; children: React.ReactNode }) {
  return (
    <Animated.View entering={FadeInDown.delay(delay).duration(450)} style={[styles.section, shadow]}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </Animated.View>
  );
}

function Chips({ options, value, label, onChange }: { options: number[]; value?: number; label: (v: number) => string; onChange: (v: number) => void }) {
  return (
    <View style={styles.chips}>
      {options.map((o) => (
        <PressableScale key={o} onPress={() => onChange(o)} style={[styles.chip, o === value && styles.chipOn]}>
          <Text style={[styles.chipText, o === value && styles.chipTextOn]}>{label(o)}</Text>
        </PressableScale>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  back: { color: 'rgba(255,255,255,0.85)', fontSize: 16, fontWeight: '600', marginBottom: 8 },
  title: { color: '#fff', fontSize: 30, fontWeight: '800', letterSpacing: -0.5 },
  note: { color: colors.muted, textAlign: 'center', fontSize: 13 },
  section: { backgroundColor: colors.card, borderRadius: 20, padding: 16, gap: 10 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: colors.muted, letterSpacing: 0.6, textTransform: 'uppercase' },
  tone: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, borderWidth: 1.5, borderColor: 'transparent' },
  toneSelected: { borderColor: colors.primary, backgroundColor: '#f5f8ff' },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: colors.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  toneName: { fontSize: 16, fontWeight: '600', color: colors.text },
  toneDesc: { fontSize: 13, color: colors.muted },
  play: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  playOn: { backgroundColor: colors.primary },
  playIcon: { color: colors.primary, fontSize: 13, marginLeft: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 9, paddingHorizontal: 14, borderRadius: 16, backgroundColor: colors.bg },
  chipOn: { backgroundColor: colors.primary },
  chipText: { fontWeight: '600', color: colors.text },
  chipTextOn: { color: '#fff' },
  hint: { color: colors.muted, fontSize: 13 },
  dimmed: { opacity: 0.4 },
});
