import 'leaflet/dist/leaflet.css';
import type * as Leaflet from 'leaflet';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { formatTime } from '@/api';
import { colors } from '@/ui';
import type { LatLng, StopMapProps } from './StopMap.types';

export type { StopMapProps } from './StopMap.types';

// Leave room for the back button and the bottom sheet when framing points.
const PADDING: Leaflet.FitBoundsOptions = { paddingTopLeft: [40, 80], paddingBottomRight: [40, 320], maxZoom: 16 };

// `removed` flags a torn-down map (unmount or Fast Refresh) so effects with a stale handle skip it.
type Ready = { L: typeof Leaflet; map: Leaflet.Map; layer: Leaflet.LayerGroup; removed?: boolean };

// Website: Leaflet with OpenStreetMap tiles. Leaflet touches `window` on import, so it loads in the browser only.
export function StopMap({ stops, selected, place, bus, busTitle, focus, onSelectStop }: StopMapProps) {
  const el = useRef<HTMLDivElement>(null);
  const initialStops = useRef(stops);
  const onSelect = useRef(onSelectStop);
  const [ready, setReady] = useState<Ready | null>(null);

  useEffect(() => {
    onSelect.current = onSelectStop;
  }, [onSelectStop]);

  useEffect(() => {
    let instance: Ready | undefined;
    let cancelled = false;
    import('leaflet').then((mod) => {
      if (cancelled || !el.current) return;
      const L = (mod as { default?: typeof Leaflet }).default ?? mod;
      const map = L.map(el.current, { zoomControl: false });
      L.control.zoom({ position: 'topright' }).addTo(map);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);
      map.fitBounds(bounds(initialStops.current), PADDING);
      instance = { L, map, layer: L.layerGroup().addTo(map) };
      setReady(instance);
    });
    return () => {
      cancelled = true;
      if (instance) {
        instance.removed = true;
        instance.map.remove();
      }
      setReady(null);
    };
  }, []);

  useEffect(() => {
    if (!ready || ready.removed) return;
    const { L, layer } = ready;
    layer.clearLayers();
    L.polyline(stops.map(toLL), { color: colors.primary, weight: 4, opacity: 0.8 }).addTo(layer);
    stops.forEach((s, i) => {
      const isSelected = i === selected;
      L.circleMarker(toLL(s), {
        radius: isSelected ? 10 : 6,
        color: '#fff',
        weight: 2,
        fillColor: isSelected ? '#f59e0b' : colors.primary,
        fillOpacity: 1,
      })
        .bindTooltip(text(`${s.name} · ${formatTime(s.time)}`), { direction: 'top', offset: [0, -6], permanent: isSelected })
        .on('click', () => onSelect.current(i))
        .addTo(layer);
    });
    if (place) {
      L.circleMarker(toLL(place.coords), { radius: 9, color: '#fff', weight: 3, fillColor: colors.danger, fillOpacity: 1 })
        .bindTooltip(text(place.name), { direction: 'top', offset: [0, -6] })
        .addTo(layer);
    }
    if (bus) L.marker(toLL(bus), { icon: busIcon(L), zIndexOffset: 1000 }).bindTooltip(text(busTitle), { direction: 'top' }).addTo(layer);
  }, [ready, stops, selected, place, bus, busTitle]);

  useEffect(() => {
    if (ready && !ready.removed && focus) ready.map.flyToBounds(bounds(focus), { ...PADDING, duration: 0.6 });
  }, [ready, focus]);

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* `isolation` keeps Leaflet's high z-index panes beneath the back button and sheet. */}
      <div ref={el} style={{ width: '100%', height: '100%', isolation: 'isolate', background: colors.bg }} />
    </View>
  );
}

const toLL = (p: LatLng): Leaflet.LatLngTuple => [p.latitude, p.longitude];

const bounds = (points: LatLng[]): Leaflet.LatLngBoundsExpression => points.map(toLL);

// Tooltip content as a text node, so stop and place names are never parsed as HTML.
function text(value: string) {
  const span = document.createElement('span');
  span.textContent = value;
  return span;
}

function busIcon(L: typeof Leaflet) {
  return L.divIcon({
    className: '',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    html: `<div style="width:28px;height:28px;border-radius:16px;border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:16px;background:${colors.success}">🚌</div>`,
  });
}
