import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, Ellipse, G, Line, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { gradient, PressableScale, tapFeedback } from '@/ui';

const KEY = 'welcomed';
const SKY = ['#7dd3fc', '#bae6fd', '#fef9c3'] as const;
const EASE = Easing.inOut(Easing.sin);
const BUS_W = 220;
const ROAD_H = 46;
// On "Let's ride": the bus pulls away for DRIVE_OFF_MS, then the whole scene fades for FADE_MS.
const DRIVE_OFF_MS = 1100;
const FADE_MS = 450;
const TITLE = 'Meet Bus Buddy';
const SUBTITLE = 'Commuting just got a lot easier.';

// Shown once, the first time the app opens. People who already saved routes skip it: they know the app.
export function Welcome() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    Promise.all([AsyncStorage.getItem(KEY), AsyncStorage.getItem('savedRoutes')])
      .then(([seen, routes]) => {
        if (seen) return;
        if (routes && routes !== '[]') return AsyncStorage.setItem(KEY, '1');
        setShow(true);
      })
      .catch(() => {});
  }, []);

  if (!show) return null;
  const done = () => {
    AsyncStorage.setItem(KEY, '1').catch(() => {});
    setShow(false);
  };
  return <Scene onDone={done} />;
}

function Scene({ onDone }: { onDone: () => void }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const still = useReducedMotion();
  const groundTop = height * 0.5;
  const [leaving, setLeaving] = useState(false);
  const fade = useSharedValue(1);
  const copyOut = useSharedValue(0);

  const go = () => {
    if (leaving) return;
    tapFeedback();
    setLeaving(true);
    copyOut.set(withTiming(1, { duration: 300, easing: Easing.in(Easing.quad) }));
    const driveOff = still ? 0 : DRIVE_OFF_MS;
    fade.set(withDelay(driveOff, withTiming(0, { duration: FADE_MS })));
    setTimeout(onDone, driveOff + FADE_MS);
  };

  const sceneStyle = useAnimatedStyle(() => ({ opacity: fade.get() }));
  const copyStyle = useAnimatedStyle(() => ({ opacity: 1 - copyOut.get(), transform: [{ translateY: copyOut.get() * 24 }] }));

  return (
    <Animated.View entering={FadeIn.duration(400)} style={[StyleSheet.absoluteFill, { zIndex: 100 }, sceneStyle]}>
      <LinearGradient colors={SKY} style={StyleSheet.absoluteFill} />
      <Sun still={still} right={28} top={insets.top + 36} />
      <Cloud still={still} width={width} top={insets.top + 70} size={1.1} duration={26000} start={0.15} />
      <Cloud still={still} width={width} top={insets.top + 150} size={0.75} duration={34000} start={0.6} />
      <Cloud still={still} width={width} top={insets.top + 230} size={0.9} duration={30000} start={0.9} />

      <Hills width={width} top={groundTop - 70} />
      <View style={[styles.ground, { top: groundTop }]}>
        <Road still={still} leaving={leaving} width={width} />
      </View>
      <Bus still={still} leaving={leaving} width={width} bottom={height - groundTop - ROAD_H + 8} />

      <Animated.View style={[styles.copy, { top: groundTop + ROAD_H + 36, paddingBottom: insets.bottom + 24 }, copyStyle]}>
        <Title still={still} />
        <View style={styles.subtitleRow}>
          {SUBTITLE.split(' ').map((word, i) => (
            <Animated.Text key={i} entering={FadeInDown.delay(1500 + i * 110).duration(450)} style={styles.subtitle}>
              {word}{' '}
            </Animated.Text>
          ))}
        </View>
        <Animated.View entering={FadeInDown.delay(2300).duration(500)} style={styles.buttonWrap}>
          <PressableScale onPress={go} disabled={leaving} accessibilityRole="button">
            <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.button}>
              <Text style={styles.buttonText}>{"Let's ride  →"}</Text>
            </LinearGradient>
          </PressableScale>
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

// The letters bounce in one by one as the bus arrives, then the title floats gently.
function Title({ still }: { still: boolean }) {
  const float = useSharedValue(0);
  useEffect(() => {
    if (still) return;
    float.set(withDelay(2000, withRepeat(withSequence(withTiming(-4, { duration: 1600, easing: EASE }), withTiming(0, { duration: 1600, easing: EASE })), -1)));
  }, [still, float]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: float.get() }] }));
  return (
    <Animated.View style={[styles.titleRow, style]} accessible accessibilityRole="header" accessibilityLabel={TITLE}>
      {TITLE.split('').map((ch, i) => (
        <Animated.Text key={i} entering={FadeInDown.delay(700 + i * 45).springify().damping(9)} style={styles.title}>
          {ch === ' ' ? '\u00a0' : ch}
        </Animated.Text>
      ))}
    </Animated.View>
  );
}

function Sun({ still, right, top }: { still: boolean; right: number; top: number }) {
  const spin = useSharedValue(0);
  const glow = useSharedValue(1);
  useEffect(() => {
    if (still) return;
    spin.set(withRepeat(withTiming(360, { duration: 40000, easing: Easing.linear }), -1));
    glow.set(withRepeat(withSequence(withTiming(1.08, { duration: 2200, easing: EASE }), withTiming(1, { duration: 2200, easing: EASE })), -1));
  }, [still, spin, glow]);
  const rays = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.get()}deg` }] }));
  const halo = useAnimatedStyle(() => ({ transform: [{ scale: glow.get() }] }));
  const size = 150;
  const c = size / 2;
  return (
    <View style={{ position: 'absolute', right: right - 40, top: top - 40, width: size, height: size }}>
      <Animated.View style={[StyleSheet.absoluteFill, halo]}>
        <Svg width={size} height={size}>
          <Defs>
            <RadialGradient id="glow">
              <Stop offset="0.35" stopColor="#fde68a" stopOpacity="0.9" />
              <Stop offset="1" stopColor="#fde68a" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle cx={c} cy={c} r={c} fill="url(#glow)" />
        </Svg>
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, rays]}>
        <Svg width={size} height={size}>
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i * Math.PI) / 6;
            return (
              <Line key={i} x1={c + Math.cos(a) * 40} y1={c + Math.sin(a) * 40} x2={c + Math.cos(a) * 54} y2={c + Math.sin(a) * 54} stroke="#fbbf24" strokeWidth={5} strokeLinecap="round" />
            );
          })}
        </Svg>
      </Animated.View>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={c} cy={c} r={32} fill="#facc15" />
        <Circle cx={c - 9} cy={c - 9} r={12} fill="#fef08a" opacity={0.6} />
      </Svg>
    </View>
  );
}

// Drifts left to right across the sky and wraps around; `start` is where along that trip it begins.
function Cloud({ still, width, top, size, duration, start }: { still: boolean; width: number; top: number; size: number; duration: number; start: number }) {
  const w = 120 * size;
  const span = width + w * 2;
  const x = useSharedValue(start);
  useEffect(() => {
    if (still) return;
    x.set(
      withSequence(
        withTiming(1, { duration: duration * (1 - start), easing: Easing.linear }),
        withRepeat(withSequence(withTiming(0, { duration: 0 }), withTiming(1, { duration, easing: Easing.linear })), -1),
      ),
    );
  }, [still, x, duration, start]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() * span - w }] }));
  return (
    <Animated.View style={[{ position: 'absolute', top, left: 0 }, style]}>
      <Svg width={w} height={60 * size} viewBox="0 0 120 60">
        <G fill="#fff">
          <Ellipse cx={60} cy={38} rx={52} ry={18} />
          <Circle cx={40} cy={30} r={20} />
          <Circle cx={68} cy={22} r={22} />
          <Circle cx={88} cy={34} r={14} />
        </G>
      </Svg>
    </Animated.View>
  );
}

function Hills({ width, top }: { width: number; top: number }) {
  const w = width;
  return (
    <Svg width={w} height={80} style={{ position: 'absolute', top, left: 0 }}>
      <Path d={`M0 60 Q ${w * 0.2} 0 ${w * 0.45} 45 T ${w} 30 V 80 H 0 Z`} fill="#86efac" />
      <Path d={`M0 70 Q ${w * 0.35} 30 ${w * 0.6} 62 T ${w} 55 V 80 H 0 Z`} fill="#4ade80" />
    </Svg>
  );
}

// The dashes slide left forever, so the bus looks like it keeps driving once it's parked mid-screen.
// When the bus pulls away they speed up with it.
function Road({ still, leaving, width }: { still: boolean; leaving: boolean; width: number }) {
  const dash = 48;
  const shift = useSharedValue(0);
  useEffect(() => {
    if (still) return;
    shift.set(0);
    shift.set(withRepeat(withTiming(-dash, { duration: leaving ? 140 : 600, easing: Easing.linear }), -1));
  }, [still, leaving, shift]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: shift.get() }] }));
  return (
    <View style={styles.road}>
      <Animated.View style={[styles.dashes, style]}>
        {Array.from({ length: Math.ceil(width / dash) + 2 }, (_, i) => (
          <View key={i} style={styles.dash} />
        ))}
      </Animated.View>
    </View>
  );
}

// Drives in and idles mid-screen; on leave it rocks back, then speeds off to the right with speed lines behind.
function Bus({ still, leaving, width, bottom }: { still: boolean; leaving: boolean; width: number; bottom: number }) {
  const x = useSharedValue(-BUS_W - 20);
  const bob = useSharedValue(0);
  const spin = useSharedValue(0);
  const tilt = useSharedValue(0);
  const streak = useSharedValue(0);
  useEffect(() => {
    const center = (width - BUS_W) / 2;
    if (still) {
      x.set(center);
      return;
    }
    if (leaving) {
      x.set(withSequence(withTiming(x.get() - 14, { duration: 180, easing: Easing.out(Easing.quad) }), withTiming(width + 80, { duration: DRIVE_OFF_MS - 180, easing: Easing.in(Easing.cubic) })));
      tilt.set(withSequence(withTiming(2, { duration: 180 }), withTiming(-4, { duration: 300 }), withTiming(-2, { duration: 400 })));
      streak.set(withDelay(200, withTiming(1, { duration: 250 })));
      spin.set(0);
      spin.set(withRepeat(withTiming(360, { duration: 180, easing: Easing.linear }), -1));
      return;
    }
    x.set(withDelay(250, withSpring(center, { damping: 14, stiffness: 60, mass: 1.2 })));
    bob.set(withRepeat(withSequence(withTiming(-2.5, { duration: 260, easing: EASE }), withTiming(0, { duration: 260, easing: EASE })), -1));
    spin.set(withRepeat(withTiming(360, { duration: 700, easing: Easing.linear }), -1));
  }, [still, leaving, width, x, bob, spin, tilt, streak]);
  const body = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
  const shell = useAnimatedStyle(() => ({ transform: [{ translateY: bob.get() }, { rotate: `${tilt.get()}deg` }] }));
  const wheel = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.get()}deg` }] }));
  const lines = useAnimatedStyle(() => ({ opacity: streak.get(), transform: [{ scaleX: 0.4 + streak.get() * 0.6 }] }));

  return (
    <Animated.View style={[{ position: 'absolute', left: 0, bottom, width: BUS_W, height: 110 }, body]} accessibilityLabel="A bus driving on a sunny day">
      <Animated.View style={[styles.streaks, lines]} pointerEvents="none">
        {[18, 40, 62].map((top, i) => (
          <View key={top} style={[styles.streak, { top, width: 70 - i * 14 }]} />
        ))}
      </Animated.View>
      <Animated.View style={shell}>
        <Svg width={BUS_W} height={96} viewBox="0 0 220 96">
          <Ellipse cx={110} cy={92} rx={100} ry={4} fill="#000" opacity={0.12} />
          <Rect x={6} y={8} width={208} height={72} rx={18} fill="#2563eb" />
          <Rect x={6} y={56} width={208} height={10} fill="#1d4ed8" />
          <Rect x={6} y={8} width={208} height={8} rx={4} fill="#3b82f6" />
          {[22, 64, 106, 148].map((wx) => (
            <Rect key={wx} x={wx} y={22} width={34} height={26} rx={6} fill="#e0f2fe" />
          ))}
          <Path d="M188 22 h12 a8 8 0 0 1 8 8 v18 h-20 z" fill="#e0f2fe" />
          <Rect x={190} y={60} width={16} height={6} rx={3} fill="#fde047" />
          <Rect x={8} y={60} width={8} height={6} rx={3} fill="#f87171" />
          <Circle cx={39} cy={35} r={6} fill="#fcd34d" />
          <Path d="M33 48 q6 -8 12 0" fill="#fcd34d" />
          <Circle cx={123} cy={35} r={6} fill="#fdba74" />
          <Path d="M117 48 q6 -8 12 0" fill="#fdba74" />
        </Svg>
      </Animated.View>
      {[34, 156].map((left) => (
        <Animated.View key={left} style={[styles.wheel, { left }, wheel]}>
          <Svg width={32} height={32}>
            <Circle cx={16} cy={16} r={15} fill="#1e293b" />
            <Circle cx={16} cy={16} r={7} fill="#cbd5e1" />
            <Line x1={16} y1={9} x2={16} y2={23} stroke="#64748b" strokeWidth={2} />
            <Line x1={9} y1={16} x2={23} y2={16} stroke="#64748b" strokeWidth={2} />
          </Svg>
        </Animated.View>
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  ground: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#f8fafc' },
  road: { height: ROAD_H, backgroundColor: '#475569', justifyContent: 'center', overflow: 'hidden' },
  dashes: { flexDirection: 'row' },
  dash: { width: 28, height: 4, marginRight: 20, borderRadius: 2, backgroundColor: '#fde047' },
  wheel: { position: 'absolute', top: 66, width: 32, height: 32 },
  copy: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 28, alignItems: 'center' },
  streaks: { position: 'absolute', right: BUS_W - 4, top: 0, width: 80, height: 90, transformOrigin: 'right' },
  streak: { position: 'absolute', right: 0, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.9)' },
  titleRow: { flexDirection: 'row' },
  title: { fontSize: 36, fontWeight: '800', color: '#0f172a', letterSpacing: -0.5 },
  subtitleRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 8 },
  subtitle: { fontSize: 18, color: '#475569' },
  buttonWrap: { alignSelf: 'stretch', marginTop: 'auto' },
  button: { borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
