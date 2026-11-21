// GET /api/traffic with TomTom faked: the key, the shared 20-minute copy, and failures.
import { corridorIncidents } from '@/server/traffic';
import { forgetIncidents, GET } from '@/app/api/traffic+api';

jest.mock('@/server/traffic', () => ({ corridorIncidents: jest.fn() }));
const incidents = corridorIncidents as jest.MockedFunction<typeof corridorIncidents>;
const accident = { id: 'i1', kind: 'accident' as const, what: null, road: 'US-9W', from: null, to: null, delayMin: 5, until: null, points: [[40.9, -73.96]] as [number, number][] };

beforeEach(() => {
  forgetIncidents();
  incidents.mockReset().mockResolvedValue([accident]);
  process.env.TOMTOM_KEY = 'k123';
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
  delete process.env.TOMTOM_KEY;
});

describe('GET /api/traffic', () => {
  it('gives the corridor’s incidents, cached for the CDN', async () => {
    const res = await GET();
    expect(incidents).toHaveBeenCalledWith('k123');
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=600, s-maxage=1200');
    expect(await res.json()).toEqual([accident]);
  });

  it('asks TomTom again only after 20 minutes', async () => {
    jest.useFakeTimers({ now: Date.parse('2026-11-21T20:00:00Z') });
    await GET();
    jest.setSystemTime(Date.parse('2026-11-21T20:19:00Z'));
    await GET();
    expect(incidents).toHaveBeenCalledTimes(1);
    jest.setSystemTime(Date.parse('2026-11-21T20:21:00Z'));
    await GET();
    expect(incidents).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });

  it('says traffic is unavailable without a key', async () => {
    delete process.env.TOMTOM_KEY;
    const res = await GET();
    expect(res.status).toBe(503);
    expect(incidents).not.toHaveBeenCalled();
  });

  it('says so when TomTom fails, and tries again next time', async () => {
    incidents.mockRejectedValueOnce(new Error('tomtom → 429'));
    expect((await GET()).status).toBe(502);
    expect((await GET()).status).toBe(200);
  });
});
