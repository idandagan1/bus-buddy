import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Mask, RadialGradient, Rect, Stop } from 'react-native-svg';

const SKY = ['#060b26', '#13184a', '#2a1b5c'] as const;
const EASE = Easing.inOut(Easing.sin);

// Deterministic "random" so stars don't jump around between renders.
const STARS = Array.from({ length: 28 }, (_, i) => {
  const r = (n: number) => ((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1;
  return { left: r(1) * 100, top: r(2) * 70, size: 1.5 + r(3) * 2.5, delay: r(4) * 3000, duration: 1400 + r(5) * 2200 };
});

export function NightSky({ children }: { children: ReactNode }) {
  return (
    <LinearGradient colors={SKY} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={StyleSheet.absoluteFill}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {STARS.map((s, i) => (
          <Star key={i} {...s} />
        ))}
      </View>
      {children}
    </LinearGradient>
  );
}

function Star({ left, top, size, delay, duration }: { left: number; top: number; size: number; delay: number; duration: number }) {
  const o = useSharedValue(0.2);
  useEffect(() => {
    o.set(withDelay(delay, withRepeat(withSequence(withTiming(1, { duration, easing: EASE }), withTiming(0.2, { duration, easing: EASE })), -1)));
  }, [o, delay, duration]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View
      style={[{ position: 'absolute', left: `${left}%`, top: `${top}%`, width: size, height: size, borderRadius: size, backgroundColor: '#fff' }, style]}
    />
  );
}

// Crescent moon that floats and sways slowly, with a breathing glow behind it.
export function Moon({ size = 140 }: { size?: number }) {
  const float = useSharedValue(0);
  const glow = useSharedValue(0);
  useEffect(() => {
    float.set(withRepeat(withTiming(1, { duration: 3200, easing: EASE }), -1, true));
    glow.set(withRepeat(withTiming(1, { duration: 2600, easing: EASE }), -1, true));
  }, [float, glow]);

  const moonStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -8 + float.value * 16 }, { rotate: `${-6 + float.value * 12}deg` }],
  }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: 0.55 + glow.value * 0.45, transform: [{ scale: 1 + glow.value * 0.18 }] }));

  return (
    <View style={{ width: size * 1.6, height: size * 1.6, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[StyleSheet.absoluteFill, glowStyle]}>
        <Svg width="100%" height="100%" viewBox="0 0 100 100">
          <Defs>
            <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="#fde68a" stopOpacity="0.5" />
              <Stop offset="0.45" stopColor="#fbbf24" stopOpacity="0.18" />
              <Stop offset="1" stopColor="#fbbf24" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle cx="50" cy="50" r="50" fill="url(#glow)" />
        </Svg>
      </Animated.View>
      <Animated.View style={moonStyle}>
        <Svg width={size} height={size} viewBox="0 0 140 140">
          <Defs>
            <SvgGradient id="moon" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#fffbea" />
              <Stop offset="1" stopColor="#fcd34d" />
            </SvgGradient>
            <Mask id="cut">
              <Rect width="140" height="140" fill="white" />
              <Circle cx="94" cy="50" r="42" fill="black" />
            </Mask>
          </Defs>
          <Circle cx="70" cy="70" r="50" fill="url(#moon)" mask="url(#cut)" />
          <Circle cx="44" cy="88" r="7" fill="#d97706" opacity="0.18" mask="url(#cut)" />
          <Circle cx="38" cy="62" r="4.5" fill="#d97706" opacity="0.15" mask="url(#cut)" />
          <Circle cx="62" cy="104" r="5" fill="#d97706" opacity="0.15" mask="url(#cut)" />
        </Svg>
      </Animated.View>
    </View>
  );
}
