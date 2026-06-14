'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { changeEmail } from '@/lib/auth-client';
import { changeEmailSchema } from '@/lib/validators/profile-security';

interface Props {
  currentEmail: string;
  emailVerified: boolean;
}

export function EmailChangeForm({ currentEmail, emailVerified }: Props) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // On success we keep a confirmation note instead of clearing into the resting
  // state — the change isn't applied until the user clicks the emailed link, so
  // the UI shouldn't imply it's done. Which inbox the link lands in depends on
  // verification state (see submit()), so we store the address to check.
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function submit() {
    setError(null);
    const parsed = changeEmailSchema.safeParse({ email: value.trim() });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Enter a valid email address.');
      return;
    }
    if (parsed.data.email.toLowerCase() === currentEmail.toLowerCase()) {
      setError('That is already your email address.');
      return;
    }
    setLoading(true);
    const result = await changeEmail({
      newEmail: parsed.data.email,
      callbackURL: '/account/profile',
    });
    setLoading(false);
    if (result.error) {
      setError(result.error.message ?? 'Could not start the email change. Please try again.');
      return;
    }
    // A verified current email gets a confirmation link at the CURRENT address
    // (anti-hijack); an unverified one gets a verification link at the NEW
    // address. Point the user at the right inbox.
    setSentTo(emailVerified ? currentEmail : parsed.data.email);
    setEditing(false);
    setValue('');
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm">{currentEmail}</span>
        {emailVerified ? (
          <span className="bg-success/10 text-success rounded-full px-2 py-0.5 text-xs font-medium">
            Verified
          </span>
        ) : (
          <span className="bg-secondary text-muted-foreground rounded-full px-2 py-0.5 text-xs font-medium">
            Unverified
          </span>
        )}
      </div>

      {sentTo && (
        <p role="status" className="text-success text-sm">
          Check {sentTo} for a link to confirm the change.
        </p>
      )}

      {editing ? (
        <form
          noValidate
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="new-email">New email</Label>
            <Input
              id="new-email"
              type="email"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              required
              autoComplete="email"
              maxLength={254}
              aria-invalid={error ? true : undefined}
            />
            <p className="text-muted-foreground text-xs">
              {emailVerified
                ? 'We’ll email a confirmation link to your current address. The change takes effect only after you click it.'
                : 'We’ll email a verification link to the new address. The change takes effect only after you click it.'}
            </p>
          </div>
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button type="submit" disabled={loading}>
              {loading ? 'Sending…' : 'Send confirmation'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={loading}
              onClick={() => {
                setEditing(false);
                setValue('');
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setSentTo(null);
            setEditing(true);
          }}
        >
          Change email
        </Button>
      )}
    </div>
  );
}
