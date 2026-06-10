'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { updateProfileAction } from '@/lib/actions/profile';

interface Props {
  defaults: {
    firstName: string;
    lastName: string;
    email: string;
  };
}

export function ProfileForm({ defaults }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [saved, setSaved] = useState(false);

  function fieldError(name: string): string | undefined {
    return fieldErrors[name]?.[0];
  }

  return (
    <form
      noValidate
      className="space-y-5"
      action={(formData) => {
        setError(null);
        setFieldErrors({});
        setSaved(false);
        startTransition(async () => {
          const result = await updateProfileAction(formData);
          if (!result.ok) {
            setError(result.error);
            setFieldErrors(result.fieldErrors ?? {});
            return;
          }
          setSaved(true);
          router.refresh();
        });
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="profile-first-name">First name</Label>
          <Input
            id="profile-first-name"
            name="firstName"
            defaultValue={defaults.firstName}
            required
            minLength={1}
            maxLength={40}
            autoComplete="given-name"
            aria-invalid={fieldError('firstName') ? true : undefined}
          />
          {fieldError('firstName') && (
            <p className="text-destructive text-xs">{fieldError('firstName')}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="profile-last-name">Last name</Label>
          <Input
            id="profile-last-name"
            name="lastName"
            defaultValue={defaults.lastName}
            maxLength={40}
            autoComplete="family-name"
            aria-invalid={fieldError('lastName') ? true : undefined}
          />
          {fieldError('lastName') && (
            <p className="text-destructive text-xs">{fieldError('lastName')}</p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="profile-email">Email</Label>
        <Input id="profile-email" value={defaults.email} readOnly disabled />
        <p className="text-muted-foreground text-xs">
          Email changes require re-verification — not available yet.
        </p>
      </div>

      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      {saved && !error && (
        <p role="status" className="text-success text-sm">
          Saved.
        </p>
      )}

      <Button type="submit" size="lg" disabled={isPending}>
        {isPending ? 'Saving…' : 'Save changes'}
      </Button>
    </form>
  );
}
