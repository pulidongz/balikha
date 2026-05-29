'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { requestPasswordReset } from '@/lib/auth-client';

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit() {
    setLoading(true);
    // Always-success UX: we never surface "no account exists" — that's
    // an account-enumeration leak. Better Auth's endpoint is silent on
    // that too. If the email is real, a reset link is on the way.
    const result = await requestPasswordReset({
      email,
      redirectTo: '/reset-password',
    });
    setLoading(false);
    if (result.error) {
      // Enumeration protection preserves the friendly message regardless,
      // but log endpoint-level errors (network, RESET_PASSWORD_DISABLED,
      // rate limits) so the dev sees them and so future Sentry can catch
      // them. NOTE: Resend send failures don't surface here — they're
      // swallowed by Better Auth's runInBackgroundOrAwait. Those surface
      // only via the server-side logger.error in lib/auth.ts under the
      // event name 'email.reset.send_failed'.
      console.error('requestPasswordReset failed:', result.error);
    }
    setSent(true);
  }

  if (sent) {
    return (
      <p className="text-muted-foreground text-sm" role="status">
        If an account exists for <span className="text-foreground">{email}</span>, a password reset
        link is on its way. The link is valid for 1 hour.
      </p>
    );
  }

  return (
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
      <Button type="submit" disabled={loading} size="lg" className="h-11 w-full">
        {loading ? 'Sending…' : 'Send reset link'}
      </Button>
    </form>
  );
}
