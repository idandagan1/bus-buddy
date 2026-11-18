// A GTFS-realtime feed indexed by trip id without decoding it. NJ Transit's trip updates cover every bus
// (~4.6 MB, ~2,000 trips) and a full decode costs ~115 ms of CPU, enough to hit the host's per-request CPU
// limit at rush hour. Reading only the field headers to find each entity's bytes and trip id is a small
// fraction of that; the few trips a request asks about are then decoded on their own.
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';

const { FeedEntity, FeedHeader } = GtfsRealtimeBindings.transit_realtime;
const utf8 = new TextDecoder();

export type IndexedFeed = {
  header: GtfsRealtimeBindings.transit_realtime.IFeedHeader | null;
  // Each entity's encoded bytes, by trip id.
  entities: Map<string, Uint8Array>;
};

function varint(buf: Uint8Array, pos: number): [number, number] {
  let value = 0;
  let shift = 0;
  let byte: number;
  do {
    byte = buf[pos++];
    // Multiply instead of shifting: lengths are small, but timestamps in skipped fields run past 32 bits.
    value += (byte & 0x7f) * 2 ** shift;
    shift += 7;
  } while (byte & 0x80);
  return [value, pos];
}

// Calls `onField` for each length-delimited field of the message in buf[start, end); skips the rest.
function eachField(buf: Uint8Array, start: number, end: number, onField: (field: number, from: number, to: number) => boolean | void) {
  let pos = start;
  while (pos < end) {
    let tag: number;
    [tag, pos] = varint(buf, pos);
    const field = tag >>> 3;
    switch (tag & 7) {
      case 0:
        [, pos] = varint(buf, pos);
        break;
      case 1:
        pos += 8;
        break;
      case 2: {
        let len: number;
        [len, pos] = varint(buf, pos);
        if (onField(field, pos, pos + len) === false) return;
        pos += len;
        break;
      }
      case 5:
        pos += 4;
        break;
      default:
        throw new Error(`gtfs-rt: unsupported wire type ${tag & 7}`);
    }
  }
}

// FeedEntity.trip_update (3) or .vehicle (4) → .trip (1) → TripDescriptor.trip_id (1).
function tripIdOf(buf: Uint8Array, start: number, end: number) {
  let id: string | undefined;
  eachField(buf, start, end, (field, from, to) => {
    if (field !== 3 && field !== 4) return;
    eachField(buf, from, to, (f, tFrom, tTo) => {
      if (f !== 1) return;
      eachField(buf, tFrom, tTo, (g, idFrom, idTo) => {
        if (g === 1) id = utf8.decode(buf.subarray(idFrom, idTo));
        return g !== 1;
      });
      return false;
    });
    return false;
  });
  return id;
}

export function indexFeed(buf: Uint8Array): IndexedFeed {
  let header: IndexedFeed['header'] = null;
  const entities = new Map<string, Uint8Array>();
  // FeedMessage.header (1), FeedMessage.entity (2, repeated).
  eachField(buf, 0, buf.length, (field, from, to) => {
    if (field === 1) header = FeedHeader.decode(buf.subarray(from, to));
    if (field !== 2) return;
    const id = tripIdOf(buf, from, to);
    if (id) entities.set(id, buf.subarray(from, to));
  });
  return { header, entities };
}

// Decoded on demand and remembered per feed, so polling the same trips doesn't decode them again.
const decoded = new WeakMap<IndexedFeed, Map<string, GtfsRealtimeBindings.transit_realtime.FeedEntity>>();
export function entityFor(feed: IndexedFeed, tripId: string) {
  const bytes = feed.entities.get(tripId);
  if (!bytes) return undefined;
  let cache = decoded.get(feed);
  if (!cache) decoded.set(feed, (cache = new Map()));
  let entity = cache.get(tripId);
  if (!entity) cache.set(tripId, (entity = FeedEntity.decode(bytes)));
  return entity;
}
