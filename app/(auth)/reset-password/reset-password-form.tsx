'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { CircleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/auth/password-input';
import { resetPassword } from '@/lib/auth-client';

// Shared dead-end view for an expired / incomplete reset link: a calm mark
// (oat disc + driftwood lucide icon, not alarm-red — an expired link isn't a
// destructive event), the brand serif + tick, and the primary action
// styled as primary.
function ResetLinkError({ title, body }: { title: string; body: string }) {
  return (
    <div className="space-y-4 py-2 text-center">
      <div className="bg-secondary mx-auto flex size-12 items-center justify-center rounded-full">
        <CircleAlert className="text-muted-foreground size-6" aria-hidden="true" />
      </div>
      <div>
        <h1 className="font-serif text-2xl tracking-tight">{title}</h1>
        <div aria-hidden="true" className="bg-accent mx-auto mt-3 h-0.5 w-9 rounded-full" />
      </div>
      <p className="text-muted-foreground text-sm">{body}</p>
      <Button
        size="lg"
        className="h-11 w-full"
        nativeButton={false}
        render={<Link href="/forgot-password" />}
      >
        Request a new link
      </Button>
      <Link
        href="/sign-in"
        className="text-muted-foreground hover:text-foreground block text-sm underline-offset-4 hover:underline"
      >
        Back to sign in
      </Link>
    </div>
  );
}

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  // Expired/invalid links arrive as ?error=INVALID_TOKEN with no ?token=.
  // Branch on ?error= first — otherwise an expired link would misreport
  // as "missing its token" instead of "expired or already used".
  const errorCode = searchParams.get('error');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (errorCode) {
    return (
      <ResetLinkError
        title="Link expired or used"
        body="This reset link has expired or has already been used. Request a new one to continue."
      />
    );
  }

  if (!token) {
    return (
      <ResetLinkError
        title="Link is incomplete"
        body="This reset link is missing its token. Request a new one to continue."
      />
    );
  }

  const resetToken = token;

  async function submit() {
    setError(null);
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    const result = await resetPassword({ newPassword: password, token: resetToken });
    setLoading(false);
    if (result.error) {
      setError(result.error.message ?? 'Could not reset password. The link may have expired.');
      return;
    }
    router.push('/sign-in?reset=success');
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="font-serif text-2xl tracking-tight">Choose a new password</h1>
        <div aria-hidden="true" className="bg-accent mt-2 h-0.5 w-9 rounded-full" />
        <p className="text-muted-foreground text-sm leading-relaxed">
          Enter a new password for your account. The link you clicked is single-use.
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
          <Label htmlFor="reset-password">New password</Label>
          <PasswordInput
            id="reset-password"
            name="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="new-password"
            minLength={8}
            className="h-11"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="reset-confirm">Confirm new password</Label>
          <PasswordInput
            id="reset-confirm"
            name="confirm"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            autoComplete="new-password"
            minLength={8}
            className="h-11"
          />
        </div>
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        <Button type="submit" disabled={loading} size="lg" className="h-11 w-full">
          {loading ? 'Resetting…' : 'Reset password'}
        </Button>
      </form>
      <p className="text-muted-foreground text-sm">
        <Link href="/sign-in" className="text-foreground underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
