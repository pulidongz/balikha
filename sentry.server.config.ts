import * as Sentry from '@sentry/nextjs';
import { env } from '@/env';
import { scrubEvent } from '@/lib/observability/scrub';

Sentry.init({
  dsn: env.NEXT_PUBLIC_SENTRY_DSN,
  // Active only in production AND only when a DSN is configured. Keeps
  // Sentry silent in dev and during CI builds (no DSN), protecting the
  // free-tier quota. NODE_ENV is a server var here — safe to read.
  enabled: Boolean(env.NEXT_PUBLIC_SENTRY_DSN) && env.NODE_ENV === 'production',
  environment: env.NODE_ENV,
  // Errors only — APM/tracing is an explicit non-goal (ticket #34).
  tracesSampleRate: 0,
  // Never auto-attach IPs/cookies/headers; the scrubber is the safety net.
  sendDefaultPii: false,
  beforeSend: scrubEvent,
});
