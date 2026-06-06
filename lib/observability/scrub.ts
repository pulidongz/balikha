import type { Breadcrumb, ErrorEvent } from '@sentry/nextjs';

// Headers that may carry credentials or session identity. Compared
// case-insensitively. Never send these to a third-party error tracker.
const SENSITIVE_HEADERS = new Set(['cookie', 'set-cookie', 'authorization', 'x-captcha-response']);

// Breadcrumb data fields that may carry navigation URLs (populated by
// captureRouterTransitionStart). Strip query strings from all three.
const URL_BREADCRUMB_FIELDS = ['to', 'from', 'url'] as const;

function stripQuery(url: string): string {
  const idx = url.indexOf('?');
  return idx === -1 ? url : url.slice(0, idx);
}

/**
 * Sentry `beforeSend` hook. Strips PII from an event before it leaves
 * the app: session cookies, auth/captcha headers, request bodies, parsed
 * cookies, credential-bearing query strings on the request URL, and
 * navigation breadcrumb URLs. The app handles Better Auth session tokens,
 * OAuth codes, single-use reset/verification tokens, emails, and full
 * shipping addresses — none may reach a third-party error tracker.
 *
 * Returns the (mutated) event — it never returns null, so legitimate
 * errors are always reported. Pure and runtime-agnostic (no Node APIs),
 * so it is shared by the server, edge, and client inits.
 */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  // Breadcrumb URLs are populated on client events (router transitions).
  // Scrub before the request guard — client events have no request object.
  if (event.breadcrumbs) {
    for (const crumb of event.breadcrumbs as Breadcrumb[]) {
      if (crumb.data) {
        for (const field of URL_BREADCRUMB_FIELDS) {
          const val: unknown = crumb.data[field];
          if (typeof val === 'string') {
            crumb.data[field] = stripQuery(val);
          }
        }
      }
    }
  }

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

  // Strip credential-bearing query params from the URL and query_string.
  // Sentry populates both unconditionally regardless of sendDefaultPii — the
  // app routes OAuth codes (?code=&state=) and single-use tokens (?token=)
  // through these paths.
  delete request.query_string;
  if (request.url) {
    request.url = stripQuery(request.url);
  }

  return event;
}
