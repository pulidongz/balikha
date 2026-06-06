import * as Sentry from '@sentry/nextjs';
import type { Instrumentation } from 'next';

// Called once per server instance before any request is served. Loads the
// runtime-appropriate Sentry.init (Node.js for app code, Edge for proxy.ts).
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

// Captures unhandled errors from Server Components, Route Handlers, Server
// Actions, middleware/proxy, and rendering. We wrap Sentry's helper to tag
// each event with the request's x-request-id — the SAME id proxy.ts sets
// (proxy.ts:35-39) and getRequestLogger() binds onto every Pino line
// (lib/logger-context.ts:30) — so a Sentry issue joins its server logs
// on one value (AC3). The original error still propagates to Next's error
// boundary; this hook only observes.
export const onRequestError: Instrumentation.onRequestError = (err, request, context) => {
  const raw = request.headers['x-request-id'];
  const requestId = (Array.isArray(raw) ? raw[0] : raw) ?? 'unknown';
  Sentry.withScope((scope) => {
    scope.setTag('requestId', requestId);
    Sentry.captureRequestError(err, request, context);
  });
};
