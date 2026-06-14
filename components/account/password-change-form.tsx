'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/auth/password-input';
import { changePassword } from '@/lib/auth-client';
import { changePasswordSchema } from '@/lib/validators/profile-security';

export function PasswordChangeForm() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  async function submit() {
    setError(null);
    setSaved(false);
    const parsed = changePasswordSchema.safeParse({ currentPassword, newPassword, confirm });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the fields and try again.');
      return;
    }
    setLoading(true);
    // revokeOtherSessions signs out every other device — changing a password
    // should invalidate sessions opened with the old credential.
    const result = await changePassword({
      currentPassword: parsed.data.currentPassword,
      newPassword: parsed.data.newPassword,
      revokeOtherSessions: true,
    });
    setLoading(false);
    if (result.error) {
      // The most common failure is a wrong current password; Better Auth's
      // message is surfaced rather than masked.
      setError(result.error.message ?? 'Could not change your password. Please try again.');
      return;
    }
    setSaved(true);
    setCurrentPassword('');
    setNewPassword('');
    setConfirm('');
  }

  return (
    <form
      noValidate
      className="max-w-md space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="current-password">Current password</Label>
        <PasswordInput
          id="current-password"
          name="currentPassword"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
          autoComplete="current-password"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="new-password">New password</Label>
        <PasswordInput
          id="new-password"
          name="newPassword"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
          autoComplete="new-password"
          minLength={8}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm-password">Confirm new password</Label>
        <PasswordInput
          id="confirm-password"
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
      {saved && (
        <p role="status" className="text-success text-sm">
          Password updated. Other devices have been signed out.
        </p>
      )}
      <Button type="submit" disabled={loading}>
        {loading ? 'Updating…' : 'Update password'}
      </Button>
    </form>
  );
}
