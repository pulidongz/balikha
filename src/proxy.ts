import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const incoming = request.headers.get('x-request-id');
  // Sanitization filter: reject anything not hex-or-dash, 16-64 chars.
  // Not a UUID validator — just prevents log injection.
  const id = incoming && /^[a-f0-9-]{16,64}$/i.test(incoming) ? incoming : crypto.randomUUID();

  // Mutate the request headers so downstream server components and route
  // handlers can read x-request-id via `(await headers()).get('x-request-id')`.
  // Important: this uses `request: { headers }` (upstream propagation),
  // NOT `headers` at the top level (which would set response headers to the client).
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-request-id', id);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // Also mirror to the response so the browser/client can correlate.
  response.headers.set('x-request-id', id);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
