/**
 * Deterministic guard on the Sentry beforeSend PII scrubber (ticket #34).
 * Self-contained: builds fake Sentry events and asserts that cookies,
 * auth headers, and request bodies are stripped while non-sensitive
 * fields survive. No DB / network / secrets. Run: npm run test:sentry
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

process.stdout.write('scrubEvent: strips request body and cookies\n');
{
  const e = scrubEvent(baseEvent()) as ErrorEvent;
  assert(e.request?.data === undefined, 'request.data (form/body) removed');
  assert(e.request?.cookies === undefined, 'request.cookies removed');
  assert(e.request?.url === 'https://balikha.art/checkout', 'request.url preserved');
  assert(e.request?.method === 'POST', 'request.method preserved');
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
