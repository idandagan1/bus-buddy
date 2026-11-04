import 'leaflet/dist/leaflet.css';
import type * as Leaflet from 'leaflet';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { formatTime } from '@/api';
import { showToast } from '@/components/Toast';
import { colors } from '@/ui';
import type { LatLng, StopMapProps } from './StopMap.types';

export type { StopMapProps } from './StopMap.types';

// Leave room for the back button and the bottom sheet when framing points.
const PADDING: Leaflet.FitBoundsOptions = { paddingTopLeft: [40, 80], paddingBottomRight: [40, 320], maxZoom: 16 };

// `removed` flags a torn-down map (unmount or Fast Refresh) so effects with a stale handle skip it.
type Ready = { L: typeof Leaflet; map: Leaflet.Map; layer: Leaflet.LayerGroup; meLayer: Leaflet.LayerGroup; removed?: boolean };

type Me = LatLng & { accuracy: number };

const ME_COLOR = '#0a84ff';

// Website: Leaflet with OpenStreetMap tiles. Leaflet touches `window` on import, so it loads in the browser only.
export function StopMap({ stops, selected, place, bus, busTitle, focus, onSelectStop }: StopMapProps) {
  const el = useRef<HTMLDivElement>(null);
  const initialStops = useRef(stops);
  const onSelect = useRef(onSelectStop);
  const [ready, setReady] = useState<Ready | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const watchId = useRef<number | null>(null);
  const lastFix = useRef<Me | null>(null);
  const onLocate = useRef(() => {});

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
      locateControl(L, () => onLocate.current()).addTo(map);
      map.fitBounds(bounds(initialStops.current), PADDING);
      instance = { L, map, layer: L.layerGroup().addTo(map), meLayer: L.layerGroup().addTo(map) };
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

  // The browser asks for permission on the first tap of the locate button; once granted, the dot shows up on its own.
  useEffect(() => {
    if (!ready || ready.removed) return;
    const watch = (recenter: boolean) => {
      if (!navigator.geolocation) return showToast('This browser can’t share your location.');
      let first = true;
      watchId.current = navigator.geolocation.watchPosition(
        ({ coords }) => {
          lastFix.current = { latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy };
          setMe(lastFix.current);
          if (recenter && first) ready.map.flyTo([coords.latitude, coords.longitude], Math.max(ready.map.getZoom(), 15), { duration: 0.6 });
          first = false;
        },
        (error) => {
          stop();
          lastFix.current = null;
          setMe(null);
          showToast(error.code === error.PERMISSION_DENIED ? 'Location is blocked. Allow it for this site in your browser settings.' : 'Couldn’t find your location.');
        },
        { enableHighAccuracy: true, maximumAge: 10000 },
      );
    };
    const stop = () => {
      if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    };
    onLocate.current = () => {
      if (watchId.current == null) return watch(true);
      if (lastFix.current) ready.map.flyTo(toLL(lastFix.current), Math.max(ready.map.getZoom(), 15), { duration: 0.6 });
    };
    navigator.permissions
      ?.query({ name: 'geolocation' })
      .then((status) => status.state === 'granted' && watchId.current == null && watch(false))
      .catch(() => {});
    return stop;
  }, [ready]);

  useEffect(() => {
    if (!ready || ready.removed) return;
    const { L, meLayer } = ready;
    meLayer.clearLayers();
    if (!me) return;
    L.circle(toLL(me), { radius: me.accuracy, color: ME_COLOR, weight: 1, opacity: 0.3, fillColor: ME_COLOR, fillOpacity: 0.1, interactive: false }).addTo(meLayer);
    L.circleMarker(toLL(me), { radius: 8, color: '#fff', weight: 3, fillColor: ME_COLOR, fillOpacity: 1 }).bindTooltip(text('You are here'), { direction: 'top', offset: [0, -6] }).addTo(meLayer);
  }, [ready, me]);

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

// A "show my location" button styled like Leaflet's zoom buttons.
function locateControl(L: typeof Leaflet, onClick: () => void) {
  const control = new L.Control({ position: 'topright' });
  control.onAdd = () => {
    const bar = L.DomUtil.create('div', 'leaflet-bar');
    const button = L.DomUtil.create('a', '', bar);
    button.href = '#';
    button.title = 'Show my location';
    button.setAttribute('role', 'button');
    button.setAttribute('aria-label', 'Show my location');
    button.style.cssText = 'display:flex;align-items:center;justify-content:center';
    button.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${ME_COLOR}" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5" fill="${ME_COLOR}"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>`;
    L.DomEvent.on(button, 'click', (e) => {
      L.DomEvent.stop(e);
      onClick();
    });
    return bar;
  };
  return control;
}

function busIcon(L: typeof Leaflet) {
  return L.divIcon({
    className: '',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    html: `<div style="width:28px;height:28px;border-radius:16px;border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:16px;background:${colors.success}">🚌</div>`,
  });
}
