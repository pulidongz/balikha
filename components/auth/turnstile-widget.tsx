'use client';

import { forwardRef } from 'react';
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';
import { env } from '@/env';

interface TurnstileWidgetProps {
  /** Called with the token on success, or null on expiry / error. */
  onToken: (token: string | null) => void;
  /**
   * Called when the challenge fails to load or run (script blocked by an
   * extension/proxy, network failure, bad site key) — distinct from expiry of
   * a token that was already issued (expiry just clears the token and the
   * widget re-challenges silently). Forms surface this so the user isn't left
   * staring at a permanently disabled submit button with no explanation.
   */
  onError?: () => void;
}

/**
 * Shared Turnstile challenge widget for the auth forms.
 *
 * Exposes a ref typed as `TurnstileInstance` so forms can call `.reset()` after
 * a failed submit (Turnstile tokens are single-use — callers must issue a fresh
 * challenge before each retry attempt).
 */
export const TurnstileWidget = forwardRef<TurnstileInstance | undefined, TurnstileWidgetProps>(
  function TurnstileWidget({ onToken, onError }, ref) {
    return (
      <Turnstile
        ref={ref}
        siteKey={env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
        // Render nothing for users who pass silently; only show the challenge
        // when Cloudflare actually needs human interaction. Keeps full bot
        // protection while removing the widget from the happy path.
        options={{ appearance: 'interaction-only' }}
        onSuccess={onToken}
        onExpire={() => onToken(null)}
        onError={() => {
          onToken(null);
          onError?.();
        }}
      />
    );
  },
);
