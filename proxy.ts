import { NextResponse, type NextRequest } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';

const REQUEST_ID_HEADER = 'x-request-id';

// Cookie-only auth gate. The real admin check (user.role) lives in
// app/(admin)/layout.tsx — Drizzle/postgres aren't safe in the Edge runtime
// proxy runs on, so role enforcement happens server-side after the route loads.
const PROTECTED_PREFIXES = ['/dashboard', '/admin', '/account'];

export default async function proxy(request: NextRequest) {
  // Reuse an upstream-supplied ID (Caddy injects {http.request.uuid} so the
  // edge access log and the app log share the same value), otherwise mint
  // one. crypto.randomUUID is available in the Edge runtime.
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? crypto.randomUUID();

  const path = request.nextUrl.pathname;
  const requiresAuth = PROTECTED_PREFIXES.some((prefix) => path.startsWith(prefix));

  if (requiresAuth) {
    const sessionCookie = getSessionCookie(request);
    if (!sessionCookie) {
      // Preserve the original destination (path + query) so sign-in can
      // bounce the user back to where they were going.
      const signInUrl = new URL('/sign-in', request.url);
      signInUrl.searchParams.set('next', path + request.nextUrl.search);
      const redirect = NextResponse.redirect(signInUrl);
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
  // request gets an ID. Auth checks for protected prefixes happen inside.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
