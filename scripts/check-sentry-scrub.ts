/**
 * Deterministic guard on the Sentry beforeSend PII scrubber.
 * Self-contained: builds fake Sentry events and asserts that cookies,
 * auth headers, request bodies, credential query strings, and breadcrumb
 * URLs are stripped while non-sensitive fields survive.
 * No DB / network / secrets. Run: npm run test:sentry
 */
import type { ErrorEvent } from '@sentry/nextjs';
import { scrubEvent } from '../lib/observability/scrub';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    process.stdout.write(`  ✓ ${msg}\n`);
  } else {
    failures++;
    console.error(`  ✗ ${msg}`);
  }
}

function baseEvent(): ErrorEvent {
  return {
    type: undefined,
    request: {
      url: 'https://balikha.art/checkout',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'better-auth.session_token=secret-session-value',
        authorization: 'Bearer secret-token',
        'x-captcha-response': 'turnstile-token',
        'x-request-id': 'req-abc-123',
      },
      cookies: { 'better-auth.session_token': 'secret-session-value' },
      data: { recipientName: 'Maria Santos', email: 'maria@example.com' },
    },
  } as unknown as ErrorEvent;
}

process.stdout.write('scrubEvent: strips sensitive headers\n');
{
  const e = scrubEvent(baseEvent()) as ErrorEvent;
  const headers = (e.request?.headers ?? {}) as Record<string, unknown>;
  assert(!('cookie' in headers), 'cookie header removed');
  assert(!('authorization' in headers), 'authorization header removed');
  assert(!('x-captcha-response' in headers), 'x-captcha-response header removed');
  assert(headers['content-type'] === 'application/json', 'content-type header preserved');
  assert(headers['x-request-id'] === 'req-abc-123', 'x-request-id header preserved');
}

process.stdout.write('scrubEvent: strips sensitive headers regardless of HTTP casing\n');
{
  const e = scrubEvent({
    type: undefined,
    request: {
      url: 'https://balikha.art/checkout',
      method: 'POST',
      headers: {
        Cookie: 'better-auth.session_token=secret-session-value',
        Authorization: 'Bearer secret-token',
        'X-Captcha-Response': 'turnstile-token',
        'content-type': 'application/json',
      },
    },
  } as unknown as ErrorEvent) as ErrorEvent;
  const headers = (e.request?.headers ?? {}) as Record<string, unknown>;
  assert(!('Cookie' in headers), 'Cookie (title-case) header removed');
  assert(!('Authorization' in headers), 'Authorization (title-case) header removed');
  assert(!('X-Captcha-Response' in headers), 'X-Captcha-Response (title-case) header removed');
  assert(headers['content-type'] === 'application/json', 'content-type header preserved');
}

process.stdout.write('scrubEvent: strips request body and cookies\n');
{
  const e = scrubEvent(baseEvent()) as ErrorEvent;
  assert(e.request?.data === undefined, 'request.data (form/body) removed');
  assert(e.request?.cookies === undefined, 'request.cookies removed');
  assert(e.request?.method === 'POST', 'request.method preserved');
}

process.stdout.write('scrubEvent: strips query_string and query params from request.url\n');
{
  const oauthEvent: ErrorEvent = {
    type: undefined,
    request: {
      url: 'https://balikha.art/api/auth/callback/google?code=abc123&state=csrf',
      query_string: 'code=abc123&state=csrf',
      method: 'GET',
      headers: {},
    },
  } as unknown as ErrorEvent;
  const e = scrubEvent(oauthEvent) as ErrorEvent;
  assert(e.request?.query_string === undefined, 'query_string removed');
  assert(
    e.request?.url === 'https://balikha.art/api/auth/callback/google',
    'request.url has no query string',
  );

  const tokenEvent: ErrorEvent = {
    type: undefined,
    request: {
      url: 'https://balikha.art/verify-email?token=one-time-secret',
      query_string: 'token=one-time-secret',
      method: 'GET',
      headers: {},
    },
  } as unknown as ErrorEvent;
  const e2 = scrubEvent(tokenEvent) as ErrorEvent;
  assert(e2.request?.query_string === undefined, 'query_string removed (token flow)');
  assert(
    e2.request?.url === 'https://balikha.art/verify-email',
    'request.url has no query string (token flow)',
  );

  const cleanEvent: ErrorEvent = {
    type: undefined,
    request: {
      url: 'https://balikha.art/checkout',
      method: 'POST',
      headers: {},
    },
  } as unknown as ErrorEvent;
  const e3 = scrubEvent(cleanEvent) as ErrorEvent;
  assert(
    e3.request?.url === 'https://balikha.art/checkout',
    'request.url without query string is preserved as-is',
  );
}

process.stdout.write('scrubEvent: strips query strings from navigation breadcrumb URLs\n');
{
  const clientEvent: ErrorEvent = {
    type: undefined,
    breadcrumbs: [
      {
        type: 'navigation',
        data: {
          from: '/dashboard',
          to: '/reset-password?token=one-time-secret',
        },
      },
      {
        type: 'navigation',
        data: {
          from: '/reset-password?token=one-time-secret',
          to: '/dashboard',
        },
      },
      {
        type: 'http',
        data: {
          url: 'https://balikha.art/api/auth/callback/google?code=abc123&state=csrf',
        },
      },
      {
        type: 'default',
        data: { message: 'some log entry' },
      },
    ],
  } as unknown as ErrorEvent;
  const e = scrubEvent(clientEvent) as ErrorEvent;
  const crumbs = e.breadcrumbs as Array<{ type?: string; data?: Record<string, unknown> }>;

  assert(crumbs[0]?.data?.['to'] === '/reset-password', 'to URL query string stripped');
  assert(crumbs[0]?.data?.['from'] === '/dashboard', 'from URL without query string preserved');
  assert(crumbs[1]?.data?.['from'] === '/reset-password', 'from URL query string stripped');
  assert(
    crumbs[2]?.data?.['url'] === 'https://balikha.art/api/auth/callback/google',
    'breadcrumb url query string stripped',
  );
  assert(
    crumbs[3]?.data?.['message'] === 'some log entry',
    'non-URL breadcrumb data field preserved',
  );
}

process.stdout.write('scrubEvent: tolerates a minimal event with no request\n');
{
  const e = scrubEvent({ type: undefined } as unknown as ErrorEvent);
  assert(e !== null, 'returns the event (never drops it) when there is no request');
}

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
process.stdout.write('\nAll scrubEvent checks passed\n');
