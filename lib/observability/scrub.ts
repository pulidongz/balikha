import type { ErrorEvent } from '@sentry/nextjs';

// Headers that may carry credentials or session identity. Compared
// case-insensitively. Never send these to a third-party error tracker.
const SENSITIVE_HEADERS = new Set(['cookie', 'set-cookie', 'authorization', 'x-captcha-response']);

/**
 * Sentry `beforeSend` hook (ticket #34). Strips PII from an event before
 * it leaves the app: session cookies, auth/captcha headers, and any
 * request body or parsed cookies. The app handles Better Auth session
 * tokens, emails, and full shipping addresses (`user_addresses`) — none
 * may reach Sentry (see CLAUDE.md: no PII to third parties).
 *
 * Returns the (mutated) event — it never returns null, so legitimate
 * errors are always reported. Pure and runtime-agnostic (no Node APIs),
 * so it is shared by the server, edge, and client inits.
 */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  const request = event.request;
  if (!request) return event;

  if (request.headers) {
    for (const key of Object.keys(request.headers)) {
      if (SENSITIVE_HEADERS.has(key.toLowerCase())) {
        delete request.headers[key];
      }
    }
  }

  // Request bodies/forms carry addresses, emails, passwords — drop wholesale.
  delete request.data;
  delete request.cookies;

  return event;
}
