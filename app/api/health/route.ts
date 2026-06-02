// Liveness probe for deploy verification + uptime monitoring (8B).
// Intentionally does not touch the DB — it reports that the Next server
// process is up and serving, which is what the cutover health-gate needs.
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ status: 'ok' });
}
