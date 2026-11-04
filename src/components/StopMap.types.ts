import type { TripStop } from '@/types';

export type LatLng = { latitude: number; longitude: number };

export type StopMapProps = {
  stops: TripStop[];
  selected: number;
  place: { name: string; coords: LatLng } | null;
  bus: LatLng | null;
  busTitle: string;
  // A new array re-frames the camera around these points.
  focus: LatLng[] | null;
  onSelectStop: (index: number) => void;
};
