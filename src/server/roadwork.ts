// Road work notices from town news feeds: gas and water main work, paving, closures and detours slow buses and
// can move stops. Feeds carry titles only ("JFC TENAFLY GAS WORK SCHEDULE"), so notices are picked by title.
import { TOWN_FEEDS, type RoadWork } from '@/townFeeds';

// Town notices usually cover the weeks ahead ("3-Week Look-Ahead"), so older ones are dropped after that.
export const FRESH_DAYS = 21;

const ROAD_WORK =
  /\b(roads?|streets?|paving|milling|resurfac\w*|gas work|gas main|water main|sewer|road closures?|street closures?|lane closures?|detours?|construction|traffic|utility work|excavation|curb|PSE&G)\b/i;

export const isRoadWork = (title: string) => ROAD_WORK.test(title);

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();

const tag = (item: string, name: string) => item.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`))?.[1];

// The items of an RSS feed; ones without a title, link or readable date are skipped.
export function parseRss(xml: string): { title: string; link: string; posted: string }[] {
  return [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/g)].flatMap(([, item]) => {
    const title = decode(tag(item, 'title') ?? '');
    const link = decode(tag(item, 'link') ?? '');
    const posted = Date.parse(decode(tag(item, 'pubDate') ?? ''));
    return title && link && !Number.isNaN(posted) ? [{ title, link, posted: new Date(posted).toISOString() }] : [];
  });
}

// The town's recent road work notices, newest first. `town` is as a stop names it ("Tenafly").
export async function roadWorkIn(town: string, now = Date.now()): Promise<RoadWork[]> {
  const url = TOWN_FEEDS[town.trim().toLowerCase()];
  if (!url) return [];
  const res = await fetch(url, { headers: { 'User-Agent': 'BusBuddy/1.0 (bus-buddy web app)' } });
  if (!res.ok) throw new Error(`${town} news → ${res.status}`);
  return parseRss(await res.text())
    .filter((n) => isRoadWork(n.title) && now - Date.parse(n.posted) <= FRESH_DAYS * 86400000)
    .sort((a, b) => b.posted.localeCompare(a.posted))
    .map((n) => ({ town: town.trim(), ...n }));
}
