'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthStatus } from '@/components/auth/auth-status';
import { TurnstileWidget } from '@/components/auth/turnstile-widget';
import { requestPasswordReset } from '@/lib/auth-client';
import type { TurnstileInstance } from '@marsidev/react-turnstile';

// UNKNOWN_ERROR is the captcha plugin's fail-closed code (siteverify
// unreachable or secret missing). Like the other two it is raised before any
// user lookup, so routing it to the retry branch leaks nothing — and it spares
// the user a false "check inbox" with no email and no retry signal.
const CAPTCHA_ERROR_CODES = new Set(['MISSING_RESPONSE', 'VERIFICATION_FAILED', 'UNKNOWN_ERROR']);

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  // Captcha challenge state. Tokens are single-use — reset the widget after
  // any captcha error so the user can retry with a fresh token.
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [captchaError, setCaptchaError] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileInstance | undefined>(undefined);

  function handleTurnstileToken(token: string | null) {
    setTurnstileToken(token);
    if (token) setCaptchaError(null);
  }

  async function submit() {
    setCaptchaError(null);
    setLoading(true);
    const result = await requestPasswordReset(
      { email, redirectTo: '/reset-password' },
      { headers: { 'x-captcha-response': turnstileToken ?? '' } },
    );
    setLoading(false);

    if (result.error) {
      const code = result.error.code;

      if (code !== undefined && CAPTCHA_ERROR_CODES.has(code)) {
        // Captcha errors run before any user lookup — no enumeration risk.
        // Surface a retry prompt instead of the false-positive "check inbox"
        // state; otherwise the user hits a dead-end (no email, no retry signal).
        turnstileRef.current?.reset();
        setTurnstileToken(null);
        setCaptchaError('Challenge expired or failed. Please try again.');
        return;
      }

      // All other errors (rate-limit 429, network, disabled reset, unknown
      // email, etc.) → flip to "check inbox" for enumeration safety.
      // Visible in dev for debugging only. The error is intentionally hidden
      // from the user for email-enumeration safety, so it must not leak via the
      // browser console in production either. NODE_ENV is inlined at build time.
      if (process.env.NODE_ENV !== 'production') {
        console.error('requestPasswordReset failed:', result.error);
      }
    }

    setSent(true);
  }

  if (sent) {
    return (
      <AuthStatus
        mark="mail"
        title="Check your inbox"
        description={
          <>
            If an account exists for <span className="text-foreground font-medium">{email}</span>, a
            password reset link is on its way. The link is valid for 1 hour.
          </>
        }
        footer={
          <Link href="/sign-in" className="text-foreground underline-offset-4 hover:underline">
            Back to sign in
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="font-serif text-2xl tracking-tight">Forgot your password?</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Enter your email and we&rsquo;ll send you a link to reset it.
        </p>
      </div>
      <form
        noValidate
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="forgot-email">Email</Label>
          <Input
            id="forgot-email"
            name="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="h-11"
          />
        </div>
        {captchaError && (
          <p role="alert" className="text-destructive text-sm">
            {captchaError}
          </p>
        )}
        <TurnstileWidget
          ref={turnstileRef}
          onToken={handleTurnstileToken}
          onError={() =>
            setCaptchaError(
              'Could not load the verification challenge. Please refresh and try again.',
            )
          }
        />
        <Button
          type="submit"
          disabled={loading || !turnstileToken}
          size="lg"
          className="h-11 w-full"
        >
          {loading ? 'Sending…' : 'Send reset link'}
        </Button>
      </form>
      <p className="text-muted-foreground text-sm">
        Remembered it?{' '}
        <Link href="/sign-in" className="text-foreground underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
