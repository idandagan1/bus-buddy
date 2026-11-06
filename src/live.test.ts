import { formatTime } from './api';
import { summarize } from './live';
import type { TripStatus } from './types';

const DEP = '2026-11-06T06:35:00-05:00';
const ARR = '2026-11-06T07:20:00-05:00';
const minutes = (iso: string, min: number) => new Date(new Date(iso).getTime() + min * 60000).toISOString();
const time = (iso: string) => new Date(iso).getTime();

function status(over: Partial<TripStatus> = {}): TripStatus {
  return {
    state: 'SCHEDULED',
    vehicle: null,
    departure: { scheduled: DEP },
    arrival: { scheduled: ARR },
    position: null,
    retrieved: null,
    ...over,
  };
}

describe('summarize', () => {
  it('returns null without a status', () => {
    expect(summarize(null, time(DEP))).toBeNull();
  });

  describe('upcoming', () => {
    const before = time(minutes(DEP, -10));

    it('pulses "On time" when the estimate matches the schedule', () => {
      const s = summarize(status({ departure: { scheduled: DEP, estimated: DEP } }), before);
      expect(s).toMatchObject({ text: 'On time', stage: 'upcoming', live: true, tone: 'good' });
    });

    it('says how late it is leaving', () => {
      const s = summarize(status({ departure: { scheduled: DEP, estimated: minutes(DEP, 7) } }), before);
      expect(s).toMatchObject({ text: 'Leaving 7 min late', stage: 'upcoming', tone: 'warn' });
    });

    it('stays upcoming while IN_PROGRESS but not yet at the rider’s stop', () => {
      // The bus left its first stop upstream; it hasn't reached the rider yet.
      const s = summarize(status({ state: 'IN_PROGRESS', departure: { scheduled: DEP, estimated: DEP } }), before);
      expect(s?.stage).toBe('upcoming');
    });

    it('shows nothing when there is no live data yet', () => {
      expect(summarize(status(), before)).toBeNull();
    });
  });

  describe('on the road', () => {
    const during = time(minutes(DEP, 15));

    it('shows a short, still "Departed" label', () => {
      const s = summarize(status({ state: 'IN_PROGRESS', departure: { scheduled: DEP, actual: minutes(DEP, 1) } }), during);
      expect(s).toMatchObject({ text: `Departed ${formatTime(minutes(DEP, 1))}`, stage: 'departed', live: false });
    });

    it('counts as departed once the departure time has passed', () => {
      expect(summarize(status(), during)?.stage).toBe('departed');
    });

    it('keeps the arrival delay for the wake-up backup', () => {
      const s = summarize(status({ departure: { scheduled: DEP, actual: DEP }, arrival: { scheduled: ARR, estimated: minutes(ARR, 6) } }), during);
      expect(s).toMatchObject({ stage: 'departed', arrivalDelayMin: 6, tone: 'warn' });
    });
  });

  describe('arrived', () => {
    it('uses the actual arrival', () => {
      const s = summarize(status({ arrival: { scheduled: ARR, actual: minutes(ARR, -4) } }), time(ARR));
      expect(s).toMatchObject({ text: `Arrived ${formatTime(minutes(ARR, -4))}`, stage: 'arrived', tone: 'muted', live: false });
    });

    it('counts a ride as arrived well after its arrival time, even if never reported', () => {
      expect(summarize(status({ departure: { scheduled: DEP, actual: DEP } }), time(minutes(ARR, 11)))?.stage).toBe('arrived');
      expect(summarize(status({ departure: { scheduled: DEP, actual: DEP } }), time(minutes(ARR, 5)))?.stage).toBe('departed');
    });
  });

  it('flags canceled trips', () => {
    expect(summarize(status({ state: 'CANCELED' }), time(DEP))).toMatchObject({ text: 'Canceled', stage: 'canceled', tone: 'bad' });
  });
});
