import { createAuthClient } from 'better-auth/react';

// No baseURL on purpose. Better Auth's client falls back to the relative
// path `/api/auth`, which resolves to the current page's origin at fetch
// time — so requests stay same-origin whether the page was loaded from
// https://balikha.localhost:8443 (Caddy) or http://localhost:3000
// (direct dev server). Hard-coding an absolute baseURL turns these into
// cross-origin requests, which the browser silently rejects with
// "Failed to fetch" when the target's TLS cert isn't trusted in the
// loading page's context.
//
// The server's BETTER_AUTH_URL env var still sets the canonical URL
// used in absolute links (email verification, OAuth callbacks); that's
// a separate concern from the client's fetch target.
export const authClient = createAuthClient();

export const { signIn, signUp, signOut, useSession } = authClient;
