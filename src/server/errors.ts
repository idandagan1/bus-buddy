// Upstream failures name their source ("coachusa /journey → 503", "njtransit index.json → 404"). API routes
// return that source so the app can say who failed, and log it so it shows up in the hosting logs.
export type FailureSource = 'coachusa' | 'njtransit' | 'server';

export function failureResponse(e: unknown) {
  const message = e instanceof Error ? e.message : String(e);
  const source: FailureSource = message.startsWith('coachusa') ? 'coachusa' : message.startsWith('njtransit') ? 'njtransit' : 'server';
  console.error(`[api] ${source}: ${message}`);
  return Response.json({ error: message, source }, { status: 502 });
}
