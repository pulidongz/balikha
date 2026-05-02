import { NextResponse, type NextRequest } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';

const REQUEST_ID_HEADER = 'x-request-id';

export default async function proxy(request: NextRequest) {
  // Reuse an upstream-supplied ID (Caddy injects {http.request.uuid} so the
  // edge access log and the app log share the same value), otherwise mint
  // one. crypto.randomUUID is available in the Edge runtime.
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? crypto.randomUUID();

  if (request.nextUrl.pathname.startsWith('/dashboard')) {
    const sessionCookie = getSessionCookie(request);
    if (!sessionCookie) {
      const redirect = NextResponse.redirect(new URL('/sign-in', request.url));
      redirect.headers.set(REQUEST_ID_HEADER, requestId);
      return redirect;
    }
  }

  // Forward the ID into the route handler / server component so
  // getRequestLogger() can read it via next/headers.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(REQUEST_ID_HEADER, requestId);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
}

export const config = {
  // Run on every request except static assets and Next internals so every
  // request gets an ID. The /dashboard auth check stays inside the function.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
