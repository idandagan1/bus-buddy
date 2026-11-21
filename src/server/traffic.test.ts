// Reading TomTom's incident details: which incidents riders see, and how they're described.
import { CORRIDOR, corridorIncidents, toIncidents } from './traffic';

const raw = (props: Record<string, unknown>, geometry: unknown = { type: 'Point', coordinates: [-73.962, 40.916] }) => ({
  geometry: geometry as { type?: string; coordinates?: unknown },
  properties: { id: 'i1', iconCategory: 1, magnitudeOfDelay: 1, ...props },
});

describe('toIncidents', () => {
  it('describes an accident: what, road, between which streets, delay in minutes, points as lat/lon', () => {
    expect(
      toIncidents({
        incidents: [raw({ events: [{ description: ' Stationary traffic ' }], roadNumbers: ['US-9W'], from: 'Clinton Ave', to: 'County Rd', delay: 370, endTime: '2026-11-21T23:00:00Z' })],
      }),
    ).toEqual([
      { id: 'i1', kind: 'accident', what: 'Stationary traffic', road: 'US-9W', from: 'Clinton Ave', to: 'County Rd', delayMin: 6, until: '2026-11-21T23:00:00Z', points: [[40.916, -73.962]] },
    ]);
  });

  it('always keeps accidents, closures and flooding; other kinds only with a moderate or major delay', () => {
    const list = [
      raw({ id: 'acc', iconCategory: 1, magnitudeOfDelay: 0 }),
      raw({ id: 'closed', iconCategory: 8, magnitudeOfDelay: 4 }),
      raw({ id: 'flood', iconCategory: 11 }),
      raw({ id: 'works-minor', iconCategory: 9, magnitudeOfDelay: 1 }),
      raw({ id: 'works-major', iconCategory: 9, magnitudeOfDelay: 3 }),
      raw({ id: 'lane-moderate', iconCategory: 7, magnitudeOfDelay: 2 }),
      raw({ id: 'ice-unknown', iconCategory: 5, magnitudeOfDelay: 0 }),
      raw({ id: 'jam', iconCategory: 6, magnitudeOfDelay: 3 }),
      raw({ id: 'fog', iconCategory: 2, magnitudeOfDelay: 3 }),
      raw({ id: 'unknown', iconCategory: 0, magnitudeOfDelay: 3 }),
      raw({ id: 'no-category', iconCategory: undefined }),
    ];
    expect(toIncidents({ incidents: list }).map((i) => i.id)).toEqual(['acc', 'closed', 'flood', 'works-major', 'lane-moderate']);
  });

  it('thins a long road down to about twenty points, keeping its end', () => {
    const line = Array.from({ length: 100 }, (_, i) => [-73.96, 40.9 + i / 1000]);
    const [inc] = toIncidents({ incidents: [raw({}, { type: 'LineString', coordinates: line })] });
    expect(inc.points.length).toBeLessThanOrEqual(21);
    expect(inc.points[0]).toEqual([40.9, -73.96]);
    expect(inc.points.at(-1)![0]).toBeCloseTo(40.999);
  });

  it('skips incidents without an id or a usable place, and leaves unknowns empty', () => {
    expect(toIncidents({ incidents: [raw({ id: undefined })] })).toEqual([]);
    // null, not undefined: undefined would fall back to the default place.
    const unusable = [null, { type: 'Polygon', coordinates: [] }, { type: 'LineString', coordinates: 'x' }, { type: 'LineString', coordinates: [['a', 1], [NaN, 2]] }];
    for (const geometry of unusable) expect(toIncidents({ incidents: [raw({}, geometry)] })).toEqual([]);
    expect(toIncidents({ incidents: [{}] })).toEqual([]);
    const [bare] = toIncidents({ incidents: [raw({ events: [], roadNumbers: [], from: '', delay: 0 })] });
    expect(bare).toMatchObject({ what: null, road: null, from: null, to: null, delayMin: null, until: null });
    expect(toIncidents({ incidents: [raw({ delay: null })] })[0].delayMin).toBeNull();
  });

  it('copes with an empty answer', () => {
    expect(toIncidents(null)).toEqual([]);
    expect(toIncidents({})).toEqual([]);
  });
});

describe('corridorIncidents', () => {
  const fetchMock = jest.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock;
  });

  it('asks TomTom for the whole corridor once', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ incidents: [raw({})] }) } as Response);
    expect(await corridorIncidents('k123')).toHaveLength(1);
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toBe('/traffic/services/5/incidentDetails');
    expect(url.searchParams.get('key')).toBe('k123');
    expect(url.searchParams.get('bbox')).toBe(CORRIDOR);
    expect(url.searchParams.get('fields')).toContain('iconCategory');
    expect(url.searchParams.get('timeValidityFilter')).toBe('present');
  });

  it('fails on an error status (a bad key, the monthly quota)', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403, json: async () => ({}) } as Response);
    await expect(corridorIncidents('k')).rejects.toThrow('tomtom → 403');
  });
});
