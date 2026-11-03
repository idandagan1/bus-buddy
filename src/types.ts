export type Stop = {
  id: string;
  name: string;
  town: string;
  state: string;
  latitude: number;
  longitude: number;
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
  departure: string;
  arrival: string;
  approximate: boolean;
  stops: TripStop[];
};

export type SavedRoute = { id: string; from: Stop; to: Stop };

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
