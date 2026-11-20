// Indexing GTFS-realtime feeds at their edges: empty feeds, odd field orders, unknown fields.
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import { entityFor, indexFeed } from './gtfsrt';

const { FeedEntity, FeedMessage } = GtfsRealtimeBindings.transit_realtime;

// Hand-built protobuf, for layouts protobufjs never writes.
const utf8 = new TextEncoder();
const varint = (n: number) => {
  const out: number[] = [];
  do {
    out.push((n & 0x7f) | (n >= 0x80 ? 0x80 : 0));
    n = Math.floor(n / 128);
  } while (n > 0);
  return out;
};
const cat = (...parts: (Uint8Array | number[])[]) => Uint8Array.from(parts.flatMap((p) => [...p]));
const field = (n: number, body: Uint8Array | string) => {
  const bytes = typeof body === 'string' ? utf8.encode(body) : body;
  return cat(varint((n << 3) | 2), varint(bytes.length), bytes);
};
const encode = (o: object) => FeedMessage.encode(FeedMessage.fromObject(o)).finish();

describe('indexFeed edges', () => {
  it('reads an empty feed as nothing', () => {
    const feed = indexFeed(new Uint8Array());
    expect(feed.header).toBeNull();
    expect(feed.entities.size).toBe(0);
  });

  it('reads a feed with only a header', () => {
    const feed = indexFeed(encode({ header: { gtfsRealtimeVersion: '2.0', timestamp: 1795000000 } }));
    expect(feed.header?.gtfsRealtimeVersion).toBe('2.0');
    expect(feed.entities.size).toBe(0);
  });

  it('skips entities without a trip id', () => {
    const feed = indexFeed(
      encode({
        header: { gtfsRealtimeVersion: '2.0' },
        entity: [
          { id: 'empty-id', tripUpdate: { trip: { tripId: '' } } },
          { id: 'route-only', tripUpdate: { trip: { routeId: '166' } } },
          { id: 'deleted', isDeleted: true },
          { id: 'ok', isDeleted: false, tripUpdate: { trip: { tripId: 'T1' }, timestamp: 2 ** 40 } },
        ],
      }),
    );
    expect([...feed.entities.keys()]).toEqual(['T1']);
  });

  it('keeps the last entity when a trip id repeats', () => {
    const feed = indexFeed(
      encode({
        header: { gtfsRealtimeVersion: '2.0' },
        entity: [
          { id: 'first', tripUpdate: { trip: { tripId: 'T1' } } },
          { id: 'second', tripUpdate: { trip: { tripId: 'T1' } } },
        ],
      }),
    );
    expect(entityFor(feed, 'T1')?.id).toBe('second');
  });

  it('finds the trip id wherever it sits in the descriptor', () => {
    // trip_update (3) → trip (1) → route_id (5) before trip_id (1).
    const entity = cat(field(1, 'e1'), field(3, field(1, cat(field(5, '166'), field(1, 'T9')))));
    const feed = indexFeed(field(2, entity));
    expect(entityFor(feed, 'T9')?.tripUpdate?.trip.routeId).toBe('166');
  });

  it('skips fixed-width and unknown fields', () => {
    const fixed32 = [(9 << 3) | 5, 1, 2, 3, 4];
    const fixed64 = [(10 << 3) | 1, 1, 2, 3, 4, 5, 6, 7, 8];
    const known = FeedEntity.encode(FeedEntity.fromObject({ id: 'e', vehicle: { trip: { tripId: 'V1' }, position: { latitude: 40.9, longitude: -73.9 } } })).finish();
    const feed = indexFeed(field(2, cat(fixed32, fixed64, known)));
    expect(entityFor(feed, 'V1')?.vehicle?.position?.latitude).toBeCloseTo(40.9);
  });

  it('refuses wire types it can’t skip', () => {
    // Field 1, wire type 3 (start group).
    expect(() => indexFeed(Uint8Array.from([(1 << 3) | 3]))).toThrow('gtfs-rt: unsupported wire type 3');
  });
});

describe('entityFor edges', () => {
  it('decodes a trip once per feed', () => {
    const bytes = encode({ header: { gtfsRealtimeVersion: '2.0' }, entity: [{ id: '1', tripUpdate: { trip: { tripId: 'T1' } } }] });
    const feed = indexFeed(bytes);
    expect(entityFor(feed, 'T1')).toBe(entityFor(feed, 'T1'));
    // A new download is decoded on its own.
    expect(entityFor(indexFeed(bytes), 'T1')).not.toBe(entityFor(feed, 'T1'));
  });
});
