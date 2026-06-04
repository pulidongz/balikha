'use client';

import { forwardRef } from 'react';
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';
import { env } from '@/env';

interface TurnstileWidgetProps {
  /** Called with the token on success, or null on expiry / error. */
  onToken: (token: string | null) => void;
}

/**
 * Shared Turnstile challenge widget for the auth forms.
 *
 * Exposes a ref typed as `TurnstileInstance` so forms can call `.reset()` after
 * a failed submit (Turnstile tokens are single-use — callers must issue a fresh
 * challenge before each retry attempt).
 */
export const TurnstileWidget = forwardRef<TurnstileInstance | undefined, TurnstileWidgetProps>(
  function TurnstileWidget({ onToken }, ref) {
    return (
      <Turnstile
        ref={ref}
        siteKey={env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
        onSuccess={onToken}
        onExpire={() => onToken(null)}
        onError={() => onToken(null)}
      />
    );
  },
);
