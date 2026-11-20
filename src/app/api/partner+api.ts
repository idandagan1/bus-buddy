import { failureResponse } from '@/server/errors';
import { findPartner } from '@/server/transit';

// GET /api/partner?from=id,lat,lon&to=id,lat,lon — the other carrier's stops at the same two places, or null.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const place = (name: string) => {
    const [id, lat, lon] = (url.searchParams.get(name) ?? '').split(',');
    // A blank coordinate isn't 0.
    return { id, latitude: lat?.trim() ? Number(lat) : NaN, longitude: lon?.trim() ? Number(lon) : NaN };
  };
  const from = place('from');
  const to = place('to');
  if (!from.id || !to.id || [from.latitude, from.longitude, to.latitude, to.longitude].some((n) => !Number.isFinite(n))) {
    return Response.json({ error: 'from and to are id,lat,lon' }, { status: 400 });
  }
  try {
    const partner = await findPartner(url.origin, from, to);
    return Response.json(partner, { headers: { 'Cache-Control': 'public, max-age=86400' } });
  } catch (e) {
    return failureResponse(e);
  }
}
