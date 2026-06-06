import * as Sentry from '@sentry/nextjs';
import { env } from '@/env';
import { scrubEvent } from '@/lib/observability/scrub';

Sentry.init({
  dsn: env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(env.NEXT_PUBLIC_SENTRY_DSN) && env.NODE_ENV === 'production',
  environment: env.NODE_ENV,
  tracesSampleRate: 0,
  sendDefaultPii: false,
  beforeSend: scrubEvent,
});
