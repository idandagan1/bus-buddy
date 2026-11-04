import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const colors = {
  bg: '#f3f5fb',
  card: '#ffffff',
  text: '#0f172a',
  muted: '#64748b',
  border: '#e2e8f0',
  primary: '#2563eb',
  primarySoft: '#e8efff',
  accent: '#7c3aed',
  success: '#10b981',
  danger: '#e11d48',
};

export const gradient = ['#0b1f4d', '#1d4ed8', '#7c3aed'] as const;

export const shadow = Platform.select<ViewStyle>({
  web: { boxShadow: '0 8px 24px rgba(15, 23, 42, 0.08)' } as ViewStyle,
  default: { shadowColor: '#0f172a', shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
});

export const tapFeedback = () => {
  if (Platform.OS !== 'web') Haptics.selectionAsync();
};

// Scrollable page: optional full-bleed hero, then a centered column capped for desktop.
// The first card tucks up under the hero; pass overlap={false} (to Hero too) when the page starts with a heading instead.
export function Page({ children, hero, overlap = true }: { children: ReactNode; hero?: ReactNode; overlap?: boolean }) {
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.outer} keyboardShouldPersistTaps="handled">
      {hero}
      <View style={[styles.inner, hero && overlap ? styles.overlap : null]}>{children}</View>
    </ScrollView>
  );
}

export function Hero({ children, overlap = true }: { children: ReactNode; overlap?: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, !overlap && styles.heroFlat, { paddingTop: insets.top + 20 }]}>
      <View style={styles.heroInner}>{children}</View>
    </LinearGradient>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Springy press-down feedback.
export function PressableScale({ style, onPressIn, onPressOut, onPress, ...rest }: PressableProps & { style?: StyleProp<ViewStyle> }) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <AnimatedPressable
      {...rest}
      style={[style, animated]}
      onPressIn={(e) => {
        scale.set(withSpring(0.97, { damping: 15, stiffness: 400 }));
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.set(withSpring(1, { damping: 12, stiffness: 300 }));
        onPressOut?.(e);
      }}
      onPress={(e) => {
        tapFeedback();
        onPress?.(e);
      }}
    />
  );
}

export function PulseDot({ color = colors.success, size = 10 }: { color?: string; size?: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.set(withRepeat(withTiming(1, { duration: 1600, easing: Easing.out(Easing.ease) }), -1, false));
  }, [t]);
  const ring = useAnimatedStyle(() => ({ opacity: 1 - t.value, transform: [{ scale: 1 + t.value * 1.8 }] }));
  return (
    <View style={{ width: size, height: size }}>
      <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: size, backgroundColor: color }, ring]} />
      <View style={[StyleSheet.absoluteFill, { borderRadius: size, backgroundColor: color }]} />
    </View>
  );
}

export function Skeleton({ height = 16, width = '100%', style }: { height?: number; width?: ViewStyle['width']; style?: StyleProp<ViewStyle> }) {
  const o = useSharedValue(0.4);
  useEffect(() => {
    o.set(withRepeat(withTiming(1, { duration: 700 }), -1, true));
  }, [o]);
  const animated = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ height, width, borderRadius: 8, backgroundColor: '#e2e8f0' }, animated, style]} />;
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.bg },
  outer: { alignItems: 'center', paddingBottom: 40 },
  inner: { width: '100%', maxWidth: 640, paddingHorizontal: 16, paddingTop: 16, gap: 14 },
  overlap: { marginTop: -44 },
  hero: { width: '100%', paddingBottom: 64, alignItems: 'center' },
  heroFlat: { paddingBottom: 24 },
  heroInner: { width: '100%', maxWidth: 640, paddingHorizontal: 20 },
});

export const EASE_OUT = Easing.bezier(0.22, 1, 0.36, 1);

// Accordion body: animates its measured height so content and everything below move smoothly.
export function Collapsible({ expanded, children }: { expanded: boolean; children: ReactNode }) {
  const height = useSharedValue(0);
  const progress = useSharedValue(expanded ? 1 : 0);
  useEffect(() => {
    progress.set(withTiming(expanded ? 1 : 0, { duration: expanded ? 380 : 260, easing: EASE_OUT }));
  }, [expanded, progress]);
  const outer = useAnimatedStyle(() => ({ height: height.value * progress.value }));
  const inner = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * -6 }],
  }));
  return (
    <Animated.View style={[{ overflow: 'hidden' }, outer]}>
      <Animated.View
        aria-hidden={!expanded}
        style={[{ position: 'absolute', top: 0, left: 0, right: 0, pointerEvents: expanded ? 'auto' : 'none' }, inner]}
        onLayout={(e) => height.set(e.nativeEvent.layout.height)}
      >
        {children}
      </Animated.View>
    </Animated.View>
  );
}

// "+" that rotates into "×" when open.
export function ToggleIcon({ open, color }: { open: boolean; color: string }) {
  const rotate = useSharedValue(open ? 45 : 0);
  useEffect(() => {
    rotate.set(withTiming(open ? 45 : 0, { duration: 300, easing: EASE_OUT }));
  }, [open, rotate]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotate.value}deg` }] }));
  return <Animated.Text style={[{ color, fontSize: 22, fontWeight: '500', width: 20, textAlign: 'center', lineHeight: 22 }, style]}>+</Animated.Text>;
}
