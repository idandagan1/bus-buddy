// GET /api/roadwork?towns=Tenafly,Cresskill — recent road work notices from those towns' news feeds.
// Towns without a feed give nothing; a feed that fails is left out rather than failing the rest.
import { roadWorkIn } from '@/server/roadwork';

export async function GET(request: Request) {
  const towns = [...new Set((new URL(request.url).searchParams.get('towns') ?? '').split(',').map((t) => t.trim()).filter(Boolean))].slice(0, 8);
  const notices = await Promise.all(
    towns.map((town) =>
      roadWorkIn(town).catch((e) => {
        console.error('roadwork: feed failed', town, e);
        return [];
      }),
    ),
  );
  return Response.json(notices.flat(), { headers: { 'Cache-Control': 'public, max-age=3600' } });
}
