import { getAdvisories } from '@/server/transit';

// GET /api/advisories?carrier=RCK&fromZone=TNFL&toZone=NYCP — active service alerts for a trip.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const carrier = url.searchParams.get('carrier');
  if (!carrier) return Response.json({ error: 'carrier is required' }, { status: 400 });
  const advisories = await getAdvisories(carrier, url.searchParams.get('fromZone'), url.searchParams.get('toZone'));
  return Response.json(advisories, { headers: { 'Cache-Control': 'public, max-age=600' } });
}
