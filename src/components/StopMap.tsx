import { AppleMaps } from 'expo-maps';
import { useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { formatTime } from '@/api';
import { colors } from '@/ui';
import type { LatLng, StopMapProps } from './StopMap.types';

export type { StopMapProps } from './StopMap.types';

// iPhone: Apple Maps.
export function StopMap({ stops, selected, place, bus, busTitle, focus, onSelectStop }: StopMapProps) {
  const map = useRef<AppleMaps.MapView>(null);

  useEffect(() => {
    if (focus) map.current?.setCameraPosition(fit(focus));
  }, [focus]);

  const markers: AppleMaps.Marker[] = [
    ...stops.map((s, i) => ({
      id: `stop-${i}`,
      title: `${s.name} · ${formatTime(s.time)}`,
      coordinates: s,
      systemImage: i === selected ? 'bell.fill' : i === 0 ? 'figure.wave' : 'bus',
      tintColor: i === selected ? '#f59e0b' : colors.primary,
    })),
    ...(place ? [{ id: 'place', title: place.name, coordinates: place.coords, systemImage: 'mappin', tintColor: colors.danger }] : []),
    ...(bus ? [{ id: 'bus', title: busTitle, coordinates: bus, systemImage: 'bus.fill', tintColor: colors.success }] : []),
  ];

  return (
    <AppleMaps.View
      ref={map}
      style={StyleSheet.absoluteFill}
      cameraPosition={fit(stops)}
      markers={markers}
      polylines={[{ id: 'route', coordinates: stops, color: colors.primary, width: 4 }]}
      properties={{ isMyLocationEnabled: true, pointsOfInterest: { including: [] } }}
      uiSettings={{ myLocationButtonEnabled: true, compassEnabled: false }}
      onMarkerClick={(m) => {
        const i = Number(m.id?.replace('stop-', ''));
        if (m.id?.startsWith('stop-') && Number.isInteger(i)) onSelectStop(i);
      }}
    />
  );
}

// Camera centred on the points, zoomed out enough to show all of them (with some margin for the sheet).
function fit(points: LatLng[]) {
  const lats = points.map((p) => p.latitude);
  const lons = points.map((p) => p.longitude);
  const [minLat, maxLat, minLon, maxLon] = [Math.min(...lats), Math.max(...lats), Math.min(...lons), Math.max(...lons)];
  const span = Math.max(maxLat - minLat, (maxLon - minLon) * 0.75, 0.005);
  return {
    // Nudge the centre south so the points sit above the bottom sheet.
    coordinates: { latitude: (minLat + maxLat) / 2 - span * 0.35, longitude: (minLon + maxLon) / 2 },
    zoom: Math.min(16, Math.log2(360 / span) - 1.6),
  };
}
