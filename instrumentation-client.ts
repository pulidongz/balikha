import * as Sentry from '@sentry/nextjs';
import { env } from '@/env';
import { scrubEvent } from '@/lib/observability/scrub';

Sentry.init({
  dsn: env.NEXT_PUBLIC_SENTRY_DSN,
  // process.env.NODE_ENV (Next inlines this on the client) — NOT env.NODE_ENV,
  // which is a server var and throws if read in client code under t3-env.
  enabled: Boolean(env.NEXT_PUBLIC_SENTRY_DSN) && process.env.NODE_ENV === 'production',
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0,
  sendDefaultPii: false,
  beforeSend: scrubEvent,
});

// Adds client-side navigation breadcrumbs so a client error shows the
// route path the user was on. Required export name for Next 16's
// instrumentation-client router-transition hook.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
