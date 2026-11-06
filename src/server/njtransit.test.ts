import { serviceTime, thin } from './njtransit';

describe('serviceTime', () => {
  it('turns GTFS minutes into a local time with its UTC offset', () => {
    expect(serviceTime('2026-11-06', 7 * 60 + 35)).toBe('2026-11-06T07:35:00-05:00');
    expect(serviceTime('2026-07-01', 7 * 60 + 35)).toBe('2026-07-01T07:35:00-04:00');
  });

  it('rolls times past midnight into the next day', () => {
    expect(serviceTime('2026-11-06', 25 * 60 + 10)).toBe('2026-11-07T01:10:00-05:00');
  });

  it('keeps wall-clock times right on the days the clocks change', () => {
    expect(serviceTime('2026-11-01', 8 * 60)).toBe('2026-11-01T08:00:00-05:00');
    expect(serviceTime('2026-03-08', 8 * 60)).toBe('2026-03-08T08:00:00-04:00');
  });
});

describe('thin', () => {
  it('keeps every stop on short trips', () => {
    expect(thin(5, 30)).toEqual([0, 1, 2, 3, 4]);
  });

  it('keeps both ends and spreads the rest on long trips', () => {
    const kept = thin(85, 30);
    expect(kept).toHaveLength(30);
    expect(kept[0]).toBe(0);
    expect(kept.at(-1)).toBe(84);
    expect(new Set(kept).size).toBe(30);
  });
});
