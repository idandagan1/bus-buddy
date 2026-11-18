import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import { entityFor, indexFeed } from './gtfsrt';

const { FeedMessage } = GtfsRealtimeBindings.transit_realtime;

const bytes = FeedMessage.encode(
  FeedMessage.fromObject({
    header: { gtfsRealtimeVersion: '2.0', timestamp: 1795000000 },
    entity: [
      { id: '1', tripUpdate: { trip: { tripId: 'A' }, delay: 120, stopTimeUpdate: [{ stopSequence: 3, arrival: { time: 1795000600 } }] } },
      { id: '2', vehicle: { trip: { tripId: 'B' }, position: { latitude: 40.9, longitude: -73.96 }, timestamp: 1795000100 } },
      { id: '3', alert: { headerText: { translation: [{ text: 'no trip here' }] } } },
    ],
  }),
).finish();

describe('indexFeed', () => {
  it('finds each trip without decoding the feed', () => {
    const feed = indexFeed(bytes);
    expect([...feed.entities.keys()]).toEqual(['A', 'B']);
    expect(Number(feed.header?.timestamp)).toBe(1795000000);
  });

  it('decodes a trip the same as a full decode would', () => {
    const feed = indexFeed(bytes);
    const full = FeedMessage.decode(bytes);
    const json = (x: unknown) => JSON.parse(JSON.stringify(x));
    expect(json(entityFor(feed, 'A'))).toEqual(json(full.entity[0]));
    expect(entityFor(feed, 'B')?.vehicle?.position?.latitude).toBeCloseTo(40.9);
    expect(entityFor(feed, 'missing')).toBeUndefined();
  });
});
