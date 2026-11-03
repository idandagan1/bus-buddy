import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EASE_OUT } from '@/ui';

const DURATION_MS = 2500;

type Message = { id: number; text: string };
const listeners = new Set<(m: Message) => void>();
let nextId = 0;

// Shows a short confirmation at the bottom of whatever screen is open.
export function showToast(text: string) {
  const message = { id: ++nextId, text };
  listeners.forEach((fn) => fn(message));
}

export function Toast() {
  const [message, setMessage] = useState<Message | null>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    listeners.add(setMessage);
    return () => {
      listeners.delete(setMessage);
    };
  }, []);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), DURATION_MS);
    return () => clearTimeout(timer);
  }, [message]);

  if (!message) return null;
  return (
    <View pointerEvents="none" style={[styles.wrap, { bottom: insets.bottom + 24 }]}>
      <Animated.View key={message.id} entering={FadeInDown.duration(300).easing(EASE_OUT)} exiting={FadeOutDown.duration(200)} style={styles.pill}>
        <Text style={styles.text}>{message.text}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 100 },
  pill: { backgroundColor: 'rgba(15,23,42,0.92)', borderRadius: 20, paddingVertical: 10, paddingHorizontal: 18 },
  text: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
