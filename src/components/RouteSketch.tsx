import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Polyline } from 'react-native-svg';

type Coord = { latitude: number; longitude: number };

const HEIGHT = 130;
const PAD = 16;

// A minimal line drawing of the trip's stops (no map tiles), with the rider's position on it.
export function RouteSketch({ path, me }: { path: Coord[]; me: Coord | null }) {
  const [width, setWidth] = useState(0);
  const points = me ? [...path, me] : path;

  // Equirectangular projection, scaled to fit while keeping the shape's proportions.
  const lat0 = (points.reduce((s, p) => s + p.latitude, 0) / points.length) * (Math.PI / 180);
  const xs = points.map((p) => p.longitude * Math.cos(lat0));
  const ys = points.map((p) => -p.latitude);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const scale = Math.min((width - PAD * 2) / (maxX - minX || 1), (HEIGHT - PAD * 2) / (maxY - minY || 1));
  const offX = (width - (maxX - minX) * scale) / 2;
  const offY = (HEIGHT - (maxY - minY) * scale) / 2;
  const project = (p: Coord) => ({
    x: offX + (p.longitude * Math.cos(lat0) - minX) * scale,
    y: offY + (-p.latitude - minY) * scale,
  });

  const stops = path.map(project);
  const dest = stops.at(-1)!;
  // Everything up to the stop nearest the rider counts as already travelled.
  const here = me ? project(me) : null;
  const nearest = here ? stops.reduce((best, s, i) => (dist(s, here) < dist(stops[best], here) ? i : best), 0) : 0;
  const line = (ps: { x: number; y: number }[]) => ps.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <View style={styles.box} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && (
        <>
          <Svg width={width} height={HEIGHT}>
            <Polyline points={line(stops)} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth={3} strokeDasharray="2 6" strokeLinecap="round" />
            {here && (
              <Polyline points={line([...stops.slice(0, nearest + 1), here])} fill="none" stroke="#a5b4fc" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
            )}
            {stops.slice(0, -1).map((s, i) => (
              <Circle key={i} cx={s.x} cy={s.y} r={2.5} fill={i <= nearest && here ? '#a5b4fc' : 'rgba(255,255,255,0.45)'} />
            ))}
            <Circle cx={dest.x} cy={dest.y} r={10} fill="rgba(253,230,138,0.18)" />
            <Circle cx={dest.x} cy={dest.y} r={5} fill="#fde68a" />
          </Svg>
          {here && <MeDot x={here.x} y={here.y} />}
        </>
      )}
    </View>
  );
}

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

function MeDot({ x, y }: { x: number; y: number }) {
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.set(withRepeat(withTiming(1, { duration: 1800, easing: Easing.out(Easing.quad) }), -1));
  }, [pulse]);
  const ring = useAnimatedStyle(() => ({ opacity: 0.6 * (1 - pulse.value), transform: [{ scale: 1 + pulse.value * 1.6 }] }));
  return (
    <View style={[styles.me, { left: x - 7, top: y - 7 }]} pointerEvents="none">
      <Animated.View style={[StyleSheet.absoluteFill, styles.meRing, ring]} />
      <View style={styles.meDot} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignSelf: 'stretch', height: HEIGHT },
  me: { position: 'absolute', width: 14, height: 14, alignItems: 'center', justifyContent: 'center' },
  meRing: { borderRadius: 7, backgroundColor: '#818cf8' },
  meDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#fff', borderWidth: 3, borderColor: '#6366f1' },
});
