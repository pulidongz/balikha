'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthMark } from '@/components/auth/auth-mark';
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
      // Always show success (enumeration protection), but log endpoint-level
      // errors (network, rate limits, disabled reset) so they're visible in dev.
      console.error('requestPasswordReset failed:', result.error);
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="space-y-4" role="status">
        <AuthMark variant="mail" />
        <div className="space-y-2">
          <p className="text-foreground font-serif text-xl tracking-tight">Check your inbox</p>
          <p className="text-muted-foreground text-sm leading-relaxed">
            If an account exists for <span className="text-foreground font-medium">{email}</span>, a
            password reset link is on its way. The link is valid for 1 hour.
          </p>
        </div>
      </div>
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
