import type { ReactElement } from 'react';
import { render } from '@react-email/render';
import { resend } from '@/lib/email/client';
import { env } from '@/env';
import { logger } from '@/lib/logger';
import { ok, err, type Result } from '@/lib/result';

export interface SendEmailOptions {
  to: string;
  subject: string;
  react: ReactElement;
  // Optional override for the From address. Defaults to env.EMAIL_FROM.
  from?: string;
  // Optional override for the Reply-To address. Defaults to env.EMAIL_REPLY_TO.
  replyTo?: string;
}

export interface SendEmailSuccess {
  messageId: string;
}

// Returns Result<SendEmailSuccess>. Never swallows: production failures
// surface via err(). The notifications fan-out at lib/notifications/emit.ts
// is a consumer-level policy that may swallow — sendEmail is the primitive
// layer and surfaces every failure.
export async function sendEmail(opts: SendEmailOptions): Promise<Result<SendEmailSuccess>> {
  const from = opts.from ?? env.EMAIL_FROM;
  const replyTo = opts.replyTo ?? env.EMAIL_REPLY_TO;

  // Render once. This happens in both dev and prod paths so template errors
  // surface identically regardless of mode.
  // Render both HTML and plain-text parts. HTML-only emails dock mail-tester
  // scores via SpamAssassin's MIME_HTML_ONLY rule (+0.7 in a 10-point scale)
  // — material risk against AC2's ≥9/10 bar. @react-email/render's plainText
  // option produces a sensible text fallback from the same React tree.
  let html: string;
  let text: string;
  try {
    html = await render(opts.react);
    text = await render(opts.react, { plainText: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Template render failed';
    logger.error({ err: e, to: opts.to, subject: opts.subject }, 'Email render failed');
    return err(`Failed to render email template: ${message}`);
  }

  // Dev-mode condition: any of the following triggers the no-send path:
  //   1. NODE_ENV !== 'production'  (default for local dev)
  //   2. resend client is null      (RESEND_API_KEY not set)
  // Override both at once by setting NODE_ENV=production AND RESEND_API_KEY
  // in the invoking shell. Used for AC1a verification.
  if (env.NODE_ENV !== 'production' || resend === null) {
    logger.info(
      {
        to: opts.to,
        from,
        replyTo,
        subject: opts.subject,
        htmlBytes: html.length,
        textBytes: text.length,
        htmlPreview: html.slice(0, 200),
      },
      'Email DEV MODE — would have sent',
    );
    // Return a synthetic message ID prefixed with `dev-mode-` so any caller
    // that logs / persists the ID can tell at a glance whether the message
    // actually went over the wire.
    return ok({ messageId: `dev-mode-${Date.now()}` });
  }

  // Production path. Pass both html and text — see plainText render above.
  const result = await resend.emails.send({
    from,
    to: opts.to,
    replyTo,
    subject: opts.subject,
    html,
    text,
  });

  if (result.error) {
    // Log errName + errMessage as flat top-level fields rather than passing
    // the whole error under `err:`. Pino's default error serializer only
    // treats Error instances specially — Resend's ErrorResponse is a plain
    // {name, message} object. Today, Pino spreads it as expected, but a
    // future change to lib/logger.ts (e.g., registering pino.stdSerializers.err)
    // would break this silently. Flat fields are stable across logger configs
    // and let AC3 Check B pin to a deterministic contract.
    logger.error(
      {
        errName: result.error.name,
        errMessage: result.error.message,
        to: opts.to,
        subject: opts.subject,
      },
      'Resend send failed',
    );
    // Include result.error.name (Resend v6's discriminated RESEND_ERROR_CODE_KEY
    // — 'invalid_api_key', 'rate_limit_exceeded', 'daily_quota_exceeded', etc.)
    // in the err message so #14/#16 consumers can prefix-match on the structured
    // code rather than string-matching against the human-readable message.
    return err(`Resend send failed [${result.error.name}]: ${result.error.message}`);
  }

  if (!result.data?.id) {
    // Defensive: Resend should always return id on success. If it doesn't,
    // treat as an error rather than fabricating a fallback messageId.
    logger.error(
      { result, to: opts.to, subject: opts.subject },
      'Resend success response missing id',
    );
    return err('Resend returned success without a message id');
  }

  logger.info({ messageId: result.data.id, to: opts.to, subject: opts.subject }, 'Email sent');
  return ok({ messageId: result.data.id });
}
