'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { sendVerificationEmail } from '@/lib/auth-client';

interface ResendVerificationBannerProps {
  email: string;
}

export function ResendVerificationBanner({ email }: ResendVerificationBannerProps) {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resend() {
    setError(null);
    setLoading(true);
    // callbackURL: '/account' — post-click the user lands back here where
    // the banner will disappear once emailVerified flips.
    const result = await sendVerificationEmail({
      email,
      callbackURL: '/account',
    });
    setLoading(false);
    if (result.error) {
      setError(result.error.message ?? 'Could not send verification email. Please try again.');
      return;
    }
    setSent(true);
  }

  return (
    <div className="border-border bg-secondary/30 rounded-lg border p-4">
      <p className="text-foreground text-sm font-medium">Please verify your email</p>
      <p className="text-muted-foreground mt-1 text-sm">
        We sent a verification link to <span className="text-foreground">{email}</span>. Until you
        verify, you can&rsquo;t place orders or open a studio.
      </p>
      {sent ? (
        <p className="text-foreground mt-3 text-sm" role="status">
          Sent. Check your inbox.
        </p>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => void resend()}
          disabled={loading}
        >
          {loading ? 'Sending…' : 'Resend verification email'}
        </Button>
      )}
      {error && (
        <p role="alert" className="text-destructive mt-2 text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
