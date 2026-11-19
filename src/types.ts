export type Stop = {
  id: string;
  name: string;
  town: string;
  state: string;
  latitude: number;
  longitude: number;
  // Set for NJ Transit stops; Coach USA stops leave it out.
  carrier?: 'NJT';
  // An NJ Transit search result on the same corner as the Coach USA stop listed just above it.
  sameCorner?: boolean;
  // NJ Transit's stop number, as on the sign at the stop.
  code?: string;
  // NJ Transit route numbers serving the stop (for a destination, only the ones also serving the origin).
  routes?: string[];
};

export type TripStop = { name: string; time: string; latitude: number; longitude: number };

export type Trip = {
  id: string;
  // Upstream journey id + service date, used to fetch live status.
  journeyId: string;
  serviceDate: string;
  route: string;
  carrier: string;
  carrierCode: string;
  fromZone: string | null;
  toZone: string | null;
  headsign: string;
  // Boarding gate at the departure stop (e.g. "410" at Port Authority), when the stop has one.
  gate: string | null;
  departure: string;
  arrival: string;
  approximate: boolean;
  stops: TripStop[];
};

// only: the route numbers to show (e.g. ["166X"]); every route when missing.
export type SavedRoute = { id: string; from: Stop; to: Stop; only?: string[] };

export type Advisory = {
  id: string;
  heading: string;
  severity: 'high' | 'low' | 'info';
  paragraphs: string[];
  updated: string | null;
};

export type LiveTime = { scheduled: string; actual?: string; estimated?: string };

export type TripStatus = {
  state: string; // SCHEDULED | IN_PROGRESS | COMPLETED | CANCELED …
  vehicle: string | null;
  departure: LiveTime;
  arrival: LiveTime;
  position: { latitude: number; longitude: number; speedMph: number | null; updated: string | null } | null;
  retrieved: string | null;
};
