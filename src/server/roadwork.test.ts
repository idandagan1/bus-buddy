// Town road work notices, read from Tenafly's real News Flash feed (Nov 2026).
import { FRESH_DAYS, isRoadWork, parseRss, roadWorkIn } from './roadwork';

const feed = `<?xml version="1.0"?><rss version="2.0"><channel>
  <title>Tenafly, NJ - News Flash</title>
  <item><title>Mayor&#39;s Message November 20, 2026</title><link>https://www.tenaflynj.gov/CivicAlerts.aspx?aid=794</link><pubDate>Fri, 20 Nov 2026 10:35:56 -0500</pubDate><description> </description></item>
  <item><title>JFC TENAFLY GAS WORK SCHEDULE</title><link>https://www.tenaflynj.gov/DocumentCenter/View/6585/JFC-11-12-2026-3-Week-Look-Ahead--Tenafly</link><pubDate>Thu, 19 Nov 2026 15:08:00 -0500</pubDate></item>
  <item><title>RECREATION BOARD MEETING-CANCELLED</title><link>https://www.tenaflynj.gov/CivicAlerts.aspx?aid=790</link><pubDate>Wed, 04 Nov 2026 09:21:30 -0500</pubDate></item>
  <item><title><![CDATA[County Road Paving & Detour on Engle St]]></title><link>https://www.tenaflynj.gov/CivicAlerts.aspx?aid=780</link><pubDate>Mon, 16 Nov 2026 08:00:00 -0500</pubDate></item>
  <item><title>Old Water Main Work</title><link>https://www.tenaflynj.gov/old</link><pubDate>Mon, 12 Oct 2026 08:00:00 -0400</pubDate></item>
  <item><title>No date road closure</title><link>https://x</link></item>
  <item><title></title><link>https://x</link><pubDate>Mon, 16 Nov 2026 08:00:00 -0500</pubDate></item>
  <item><title>No link street closure</title><pubDate>Mon, 16 Nov 2026 08:00:00 -0500</pubDate></item>
</channel></rss>`;
const NOW = Date.parse('2026-11-21T21:00:00Z');
const fetchMock = jest.fn();

beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue({ ok: true, text: async () => feed } as Response);
  globalThis.fetch = fetchMock;
});

describe('isRoadWork', () => {
  it.each([
    'JFC TENAFLY GAS WORK SCHEDULE', 'Paving on Highwood Ave', 'Road Closure: County Road', 'Water Main Replacement', 'Detour on Engle St',
    'Lane closures on 9W', 'PSE&G work on Knickerbocker', 'Street Milling Notice', 'Resurfacing begins Monday', 'Sewer repair',
  ])('picks %s', (title) => expect(isRoadWork(title)).toBe(true));

  it.each(['Mayor’s Message', 'RECREATION BOARD MEETING-CANCELLED', 'Veolia In-Home Lead Inspection Program', 'Borough Hall closed for Thanksgiving', '2026 Fall Newsletter'])(
    'skips %s',
    (title) => expect(isRoadWork(title)).toBe(false),
  );
});

describe('parseRss', () => {
  it('reads each item’s title, link and date, decoding entities and CDATA', () => {
    const items = parseRss(feed);
    expect(items[0]).toEqual({ title: 'Mayor\'s Message November 20, 2026', link: 'https://www.tenaflynj.gov/CivicAlerts.aspx?aid=794', posted: '2026-11-20T15:35:56.000Z' });
    expect(items.map((i) => i.title)).toContain('County Road Paving & Detour on Engle St');
  });

  it('skips items without a title, link or date, and reads nothing from a non-feed', () => {
    expect(parseRss(feed)).toHaveLength(5);
    expect(parseRss('<html>Not found</html>')).toEqual([]);
    expect(parseRss('')).toEqual([]);
  });
});

describe('roadWorkIn', () => {
  it('gives the town’s recent road work, newest first', async () => {
    expect(await roadWorkIn('Tenafly', NOW)).toEqual([
      { town: 'Tenafly', title: 'JFC TENAFLY GAS WORK SCHEDULE', link: 'https://www.tenaflynj.gov/DocumentCenter/View/6585/JFC-11-12-2026-3-Week-Look-Ahead--Tenafly', posted: '2026-11-19T20:08:00.000Z' },
      { town: 'Tenafly', title: 'County Road Paving & Detour on Engle St', link: 'https://www.tenaflynj.gov/CivicAlerts.aspx?aid=780', posted: '2026-11-16T13:00:00.000Z' },
    ]);
    expect(fetchMock.mock.calls[0][0]).toBe('https://www.tenaflynj.gov/RSSFeed.aspx?ModID=1&CID=All-newsflash.xml');
  });

  it(`drops notices older than ${FRESH_DAYS} days`, async () => {
    const later = Date.parse('2026-12-08T21:00:00Z');
    expect((await roadWorkIn('Tenafly', later)).map((n) => n.title)).toEqual(['JFC TENAFLY GAS WORK SCHEDULE']);
  });

  it('matches the town however a stop spells it', async () => {
    expect(await roadWorkIn(' TENAFLY ', NOW)).toHaveLength(2);
  });

  it('gives nothing for a town without a feed, without asking', async () => {
    expect(await roadWorkIn('Cresskill', NOW)).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails when the feed does', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503, text: async () => '' } as Response);
    await expect(roadWorkIn('Tenafly', NOW)).rejects.toThrow('Tenafly news → 503');
  });
});
