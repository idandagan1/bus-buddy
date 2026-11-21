// Town news feeds read for road work near riders' stops. Only Tenafly publishes one (its CivicPlus "News Flash"
// RSS); Cresskill, Demarest and Closter post notices as PDFs and social posts, with nothing to read.
export const TOWN_FEEDS: Record<string, string> = {
  tenafly: 'https://www.tenaflynj.gov/RSSFeed.aspx?ModID=1&CID=All-newsflash.xml',
};

export const hasTownFeed = (town: string | null | undefined) => !!town && town.trim().toLowerCase() in TOWN_FEEDS;

// A road work notice from a town: title as posted, link to the notice, when it was posted.
export type RoadWork = { town: string; title: string; link: string; posted: string };
