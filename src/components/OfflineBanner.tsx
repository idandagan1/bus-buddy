import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOnline } from '@/network';
import { EASE_OUT } from '@/ui';

// Floating pill at the top of every screen while the device is offline.
export function OfflineBanner() {
  const online = useOnline();
  const insets = useSafeAreaInsets();
  if (online !== false) return null;
  return (
    <View pointerEvents="none" style={[styles.wrap, { top: insets.top + 8 }]}>
      <Animated.View entering={FadeInUp.duration(300).easing(EASE_OUT)} exiting={FadeOutUp.duration(200)} style={styles.pill}>
        <View style={styles.dot} />
        <Text style={styles.text}>No internet · showing saved data</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 100 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(15,23,42,0.92)', borderRadius: 20, paddingVertical: 8, paddingHorizontal: 14 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#f87171' },
  text: { color: '#fff', fontSize: 13, fontWeight: '600' },
});
