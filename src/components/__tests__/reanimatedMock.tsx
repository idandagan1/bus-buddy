// A plain stand-in for Reanimated in Jest: Reanimated 4's own mock needs the native worklets runtime.
// Animated components render as their React Native counterparts, shared values are plain boxes,
// and animations jump to their end value.
import { useState, type ComponentType } from 'react';
import { Image, ScrollView, Text, View } from 'react-native';

type Box = { value: unknown; get: () => unknown; set: (v: unknown) => void };

const sharedValue = (initial: unknown): Box => {
  const box: Box = {
    value: initial,
    get: () => box.value,
    set: (v) => {
      box.value = v;
    },
  };
  return box;
};

// Entering/exiting presets are chainable builders (FadeIn.duration(250).easing(...).delay(70)).
const builder = (): Record<string, unknown> => {
  const b: Record<string, unknown> = {};
  for (const name of ['duration', 'delay', 'easing', 'springify', 'damping', 'stiffness', 'withCallback', 'reduceMotion']) b[name] = () => b;
  return b;
};

const easing = (): unknown => () => 0;
const Easing = new Proxy({}, { get: () => easing });

const createAnimatedComponent = <P,>(c: ComponentType<P>) => c;

const Animated = { View, Text, ScrollView, Image, createAnimatedComponent };
export default Animated;
export { View, Text, ScrollView, Image, createAnimatedComponent, Easing };

export const FadeIn = builder();
export const FadeOut = builder();
export const FadeInDown = builder();
export const FadeOutDown = builder();
export const FadeInUp = builder();
export const FadeOutUp = builder();
export const LinearTransition = builder();

// One box per component instance.
export function useSharedValue(v: unknown) {
  return useState(() => sharedValue(v))[0];
}
export const useAnimatedStyle = (fn: () => object) => fn();
// Reduced motion keeps the looping animations (the From nudge, typed placeholder) still and timer-free.
export const useReducedMotion = () => true;
export const withTiming = (v: unknown) => v;
export const withSpring = (v: unknown) => v;
export const withRepeat = (v: unknown) => v;
export const withDelay = (_d: number, v: unknown) => v;
export const withSequence = (...v: unknown[]) => v[v.length - 1];
export const cancelAnimation = () => {};
export const runOnJS = (fn: unknown) => fn;
