'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/auth/password-input';
import { setPasswordAction } from '@/lib/actions/profile';
import { setPasswordSchema } from '@/lib/validators/profile-security';

export function SetPasswordForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    const parsed = setPasswordSchema.safeParse({ newPassword, confirm });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the fields and try again.');
      return;
    }
    const formData = new FormData();
    formData.set('newPassword', parsed.data.newPassword);
    formData.set('confirm', parsed.data.confirm);
    startTransition(async () => {
      const result = await setPasswordAction(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // hasPassword now flips to true on the server — refresh so this form is
      // replaced by the change-password form.
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        You sign in with Google. Set a password to also sign in with your email and password.
      </p>
      <form
        noValidate
        className="max-w-md space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="set-new-password">New password</Label>
          <PasswordInput
            id="set-new-password"
            name="newPassword"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            autoComplete="new-password"
            minLength={8}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="set-confirm-password">Confirm password</Label>
          <PasswordInput
            id="set-confirm-password"
            name="confirm"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            autoComplete="new-password"
            minLength={8}
          />
        </div>
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Setting…' : 'Set password'}
        </Button>
      </form>
    </div>
  );
}
