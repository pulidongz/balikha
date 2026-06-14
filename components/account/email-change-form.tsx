'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { changeEmailAction } from '@/lib/actions/profile';
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
    const formData = new FormData();
    formData.set('email', parsed.data.email);
    const result = await changeEmailAction(formData);
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    // The action reports which inbox the link went to, decided from the fresh
    // server-side verification state — so this never names the wrong inbox if
    // the emailVerified prop went stale since the page rendered.
    setSentTo(result.data.sentTo);
    setEditing(false);
    setValue('');
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm">{currentEmail}</span>
        {emailVerified ? (
          <Badge variant="success">Verified</Badge>
        ) : (
          <Badge variant="secondary">Unverified</Badge>
        )}
      </div>

      {sentTo && (
        <p role="status" className="text-success text-sm">
          We&rsquo;ve sent a confirmation link to {sentTo}. If nothing arrives, the new address may
          already be in use.
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
