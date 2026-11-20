// Detours read from an alert's words, checked against NJ Transit's real 166 detour in Tenafly (Nov 2026).
import { detourLine, detoursNear, detourStreet, detourTown, isDetour, routeStops } from './detours';
import type { Advisory, Stop } from './types';

const tenaflyDetour: Advisory = {
  id: '57781',
  heading: 'Bus route 166 is on a detour on E Clinton between Westervelt Ave and Engle Street in Tenafly due to road closure.',
  severity: 'low',
  paragraphs: ['Buses will use Elm St, Engle St and Dean St.'],
  updated: null,
};
const construction: Advisory = { id: 'pabt', heading: 'Port Authority Construction Advisory', severity: 'high', paragraphs: ['Expect delays.'], updated: null };

const stop = (name: string, town: string, extra: Partial<Stop> = {}): Stop => ({ id: name, name, town, state: 'NJ', latitude: 0, longitude: 0, ...extra });
const deanAtClinton = stop('Dean Dr at East Clinton Ave', 'Tenafly', { carrier: 'NJT' });
const engleAtOak = stop('Engle St at Oak St', 'Tenafly', { carrier: 'NJT' });
const englewood = stop('Dean St at Palisade Ave', 'Englewood', { carrier: 'NJT' });
const pabt = stop('Port Authority Bus Terminal', 'New York', { carrier: 'NJT' });

describe('reading the alert', () => {
  it('knows a detour', () => {
    expect(isDetour(tenaflyDetour)).toBe(true);
    expect(isDetour(construction)).toBe(false);
    expect(isDetour({ ...construction, paragraphs: ['Buses will detour via Route 4.'] })).toBe(true);
  });

  it('finds the town and the street the buses leave', () => {
    expect(detourTown(tenaflyDetour)).toBe('Tenafly');
    expect(detourStreet(tenaflyDetour)).toBe('clinton');
  });

  it('keeps towns and streets of more than one word', () => {
    const a = { ...tenaflyDetour, heading: 'Route 156 is on a detour on Palisade Ave from Main St in Fort Lee due to an event.' };
    expect(detourTown(a)).toBe('Fort Lee');
    expect(detourStreet(a)).toBe('palisade');
    expect(detourStreet({ ...a, heading: 'Detour on North Broad Street at Elm in Ridgefield Park.' })).toBe('broad');
  });

  it('finds nothing when the alert doesn’t say', () => {
    const vague = { ...tenaflyDetour, heading: 'Some buses are on a detour.', paragraphs: [] };
    expect(detourTown(vague)).toBeNull();
    expect(detourStreet(vague)).toBeNull();
  });
});

describe('detours near a rider', () => {
  it('flags a stop on the detoured street in that town', () => {
    const [d] = detoursNear([tenaflyDetour], [deanAtClinton, pabt]);
    expect(d).toMatchObject({ near: 'street', town: 'Tenafly' });
    expect(detourLine(d)).toBe('Detour near your stop in Tenafly: buses may skip it');
  });

  it('says to check a stop elsewhere in the same town (Engle St, where riders waited 20 minutes)', () => {
    const [d] = detoursNear([tenaflyDetour], [engleAtOak, pabt]);
    expect(d.near).toBe('town');
    expect(detourLine(d)).toBe('Detour in Tenafly: check your stop');
  });

  it('only shows the alert for a route through other towns', () => {
    const [d] = detoursNear([tenaflyDetour], [englewood, pabt]);
    expect(d.near).toBeNull();
    expect(detourLine(d)).toBe(tenaflyDetour.heading);
  });

  it('doesn’t call a same-named street in another town near', () => {
    const elsewhere = stop('Clinton Ave at Main St', 'Bergenfield');
    expect(detoursNear([tenaflyDetour], [elsewhere])[0].near).toBeNull();
  });

  it('ignores town case and stops without a town', () => {
    expect(detoursNear([tenaflyDetour], [stop('Dean Dr at East Clinton Ave', 'TENAFLY')])[0].near).toBe('street');
    expect(detoursNear([tenaflyDetour], [stop('Dean Dr at East Clinton Ave', '')])[0].near).toBeNull();
  });

  it('leaves other alerts out, and puts the nearest detour first', () => {
    const farDetour = { ...tenaflyDetour, id: 'far', heading: 'Route 166 is on a detour on Main St in Hackensack.' };
    expect(detoursNear([construction, farDetour, tenaflyDetour], [deanAtClinton]).map((d) => d.advisory.id)).toEqual(['57781', 'far']);
  });
});

describe('routeStops', () => {
  it('lists both ends of both carriers', () => {
    const coach = { from: stop('Hillside Ave & Highwood Ave', 'Tenafly'), to: stop('Port Authority Bus Terminal', 'New York') };
    expect(routeStops(coach)).toHaveLength(2);
    expect(routeStops({ ...coach, also: { from: deanAtClinton, to: pabt } })).toEqual([coach.from, coach.to, deanAtClinton, pabt]);
  });
});
