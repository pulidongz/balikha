'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { resetPassword } from '@/lib/auth-client';

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
      <p role="alert" className="text-destructive text-sm">
        This reset link has expired or has already been used. Please request a new one.
      </p>
    );
  }

  if (!token) {
    return (
      <p role="alert" className="text-destructive text-sm">
        This reset link is missing its token. Please request a new one.
      </p>
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
        <Input
          id="reset-password"
          name="password"
          type="password"
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
        <Input
          id="reset-confirm"
          name="confirm"
          type="password"
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
  );
}
