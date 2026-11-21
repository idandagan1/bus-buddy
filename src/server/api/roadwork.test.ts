// GET /api/roadwork with the feeds faked: which towns are asked, and how a failing feed is left out.
import { roadWorkIn } from '@/server/roadwork';
import { GET } from '@/app/api/roadwork+api';

jest.mock('@/server/roadwork', () => ({ roadWorkIn: jest.fn() }));
const roadWork = roadWorkIn as jest.MockedFunction<typeof roadWorkIn>;
const notice = (town: string) => ({ town, title: 'Gas work', link: `https://${town}`, posted: '2026-11-19T20:08:00.000Z' });

beforeEach(() => {
  roadWork.mockReset().mockImplementation(async (town) => [notice(town)]);
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

const get = (query: string) => GET(new Request(`http://site.test/api/roadwork${query}`));

describe('GET /api/roadwork', () => {
  it('gathers each town’s notices once, cached for an hour', async () => {
    const res = await get('?towns=Tenafly, Cresskill,Tenafly,,');
    expect(roadWork.mock.calls.map((c) => c[0])).toEqual(['Tenafly', 'Cresskill']);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=3600');
    expect(await res.json()).toEqual([notice('Tenafly'), notice('Cresskill')]);
  });

  it('gives nothing without towns', async () => {
    expect(await (await get('')).json()).toEqual([]);
    expect(await (await get('?towns=')).json()).toEqual([]);
    expect(roadWork).not.toHaveBeenCalled();
  });

  it('asks about at most eight towns', async () => {
    await get(`?towns=${Array.from({ length: 12 }, (_, i) => `T${i}`).join(',')}`);
    expect(roadWork).toHaveBeenCalledTimes(8);
  });

  it('leaves out a town whose feed fails', async () => {
    roadWork.mockImplementation(async (town) => {
      if (town === 'Tenafly') throw new Error('down');
      return [notice(town)];
    });
    const res = await get('?towns=Tenafly,Closter');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([notice('Closter')]);
  });
});
