// Pull-to-refresh for a page on the web. A home-screen app on iPhone has no reload button or pull of its own,
// so pulling down from the top past a short distance reloads the whole page: fresh bus times, and the newest
// version of the app.
import { useEffect, useState, type ComponentRef, type RefObject } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, type ScrollView } from 'react-native';
import { useInsets } from '@/insets';

// ui.tsx's card and primary colors and shadow (importing ui here would be circular: its Page uses this hook).
const CARD = '#ffffff';
const PRIMARY = '#2563eb';
const SHADOW = { boxShadow: '0 8px 24px rgba(15, 23, 42, 0.08)' };

// How far (after damping the finger's travel by half) the page must be pulled to reload.
export const TRIGGER_PX = 70;
const MAX_PX = 110;

export type ScrollRef = RefObject<ComponentRef<typeof ScrollView> | null>;

// `scroll` is the page's ScrollView, which the web version listens to for the pull.
export function useRefresh(enabled: boolean, scroll: ScrollRef) {
  const [pull, setPull] = useState(0);
  const [reloading, setReloading] = useState(false);
  const insets = useInsets();

  useEffect(() => {
    const node = (scroll.current as unknown as { getScrollableNode?: () => HTMLElement } | null)?.getScrollableNode?.();
    if (!enabled || !node) return;
    let startY: number | null = null;
    let distance = 0;
    const start = (e: TouchEvent) => {
      // Only a pull that starts with the page at its top.
      startY = node.scrollTop <= 0 ? e.touches[0].clientY : null;
      distance = 0;
    };
    const move = (e: TouchEvent) => {
      if (startY === null) return;
      if (node.scrollTop > 0) {
        startY = null;
        setPull(0);
        return;
      }
      distance = Math.min(MAX_PX, Math.max(0, (e.touches[0].clientY - startY) / 2));
      setPull(distance);
    };
    const end = () => {
      if (startY !== null && distance >= TRIGGER_PX) {
        setReloading(true);
        window.location.reload();
      } else setPull(0);
      startY = null;
    };
    node.addEventListener('touchstart', start, { passive: true });
    node.addEventListener('touchmove', move, { passive: true });
    node.addEventListener('touchend', end);
    node.addEventListener('touchcancel', end);
    return () => {
      node.removeEventListener('touchstart', start);
      node.removeEventListener('touchmove', move);
      node.removeEventListener('touchend', end);
      node.removeEventListener('touchcancel', end);
    };
  }, [enabled, scroll]);

  const ready = reloading || pull >= TRIGGER_PX;
  const indicator =
    pull > 0 || reloading ? (
      <View
        pointerEvents="none"
        accessibilityLabel={reloading ? 'Reloading' : ready ? 'Release to reload' : 'Pull to reload'}
        style={[styles.bubble, SHADOW, { top: insets.top + 8 + (reloading ? TRIGGER_PX : pull) / 2, opacity: Math.min(1, (reloading ? TRIGGER_PX : pull) / TRIGGER_PX) }]}
      >
        {reloading ? (
          <ActivityIndicator color={PRIMARY} />
        ) : (
          <Text style={[styles.arrow, { transform: [{ rotate: ready ? '180deg' : '0deg' }] }]}>↓</Text>
        )}
      </View>
    ) : null;

  return { key: 0, control: undefined, indicator };
}

const styles = StyleSheet.create({
  bubble: { position: 'absolute', alignSelf: 'center', width: 40, height: 40, borderRadius: 20, backgroundColor: CARD, alignItems: 'center', justifyContent: 'center' },
  arrow: { color: PRIMARY, fontSize: 20, fontWeight: '800' },
});
