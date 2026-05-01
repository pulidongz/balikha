'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { updateArtisanProfileAction } from '@/lib/actions/artisan';

type Defaults = {
  shopSlug: string;
  shopName: string;
  bio: string | null;
  location: string | null;
  policies: string | null;
};

export function SettingsForm({ defaults }: { defaults: Defaults }) {
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
          const result = await updateArtisanProfileAction(formData);
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
      <div className="space-y-2">
        <Label htmlFor="settings-shop-name">Shop name</Label>
        <Input
          id="settings-shop-name"
          name="shopName"
          defaultValue={defaults.shopName}
          required
          minLength={2}
          maxLength={80}
          aria-invalid={fieldError('shopName') ? true : undefined}
        />
        {fieldError('shopName') && (
          <p className="text-destructive text-xs">{fieldError('shopName')}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="settings-shop-slug">Shop URL</Label>
        <Input id="settings-shop-slug" value={`/shop/${defaults.shopSlug}`} readOnly disabled />
        <p className="text-muted-foreground text-xs">
          Slug is locked once chosen — changing it would break existing bookmarks.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="settings-location">Location</Label>
        <Input
          id="settings-location"
          name="location"
          defaultValue={defaults.location ?? ''}
          placeholder="e.g. Quezon City"
          maxLength={120}
          aria-invalid={fieldError('location') ? true : undefined}
        />
        {fieldError('location') && (
          <p className="text-destructive text-xs">{fieldError('location')}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="settings-bio">Bio</Label>
        <Textarea
          id="settings-bio"
          name="bio"
          defaultValue={defaults.bio ?? ''}
          rows={4}
          placeholder="A short introduction to you and your craft."
          aria-invalid={fieldError('bio') ? true : undefined}
        />
        {fieldError('bio') && <p className="text-destructive text-xs">{fieldError('bio')}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="settings-policies">Shop policies</Label>
        <Textarea
          id="settings-policies"
          name="policies"
          defaultValue={defaults.policies ?? ''}
          rows={5}
          placeholder="Shipping, returns, custom orders…"
          aria-invalid={fieldError('policies') ? true : undefined}
        />
        {fieldError('policies') && (
          <p className="text-destructive text-xs">{fieldError('policies')}</p>
        )}
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

      <Button type="submit" disabled={isPending}>
        {isPending ? 'Saving…' : 'Save changes'}
      </Button>
    </form>
  );
}
