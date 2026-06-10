'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { updateArtisanProfileAction } from '@/lib/actions/artisan';
import { studioPath } from '@/lib/routes';

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
  // Controlled inputs, seeded once from `defaults`. A successful save calls
  // router.refresh(), which feeds new `defaults` into this persisted instance;
  // controlled state ignores that, avoiding Base UI's changed-defaultValue
  // warning while keeping the "Saved." message (the instance is not remounted).
  const [shopName, setShopName] = useState(defaults.shopName);
  const [location, setLocation] = useState(defaults.location ?? '');
  const [bio, setBio] = useState(defaults.bio ?? '');
  const [policies, setPolicies] = useState(defaults.policies ?? '');

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
        <Label htmlFor="settings-shop-name">Studio name</Label>
        <Input
          id="settings-shop-name"
          name="shopName"
          value={shopName}
          onChange={(e) => setShopName(e.target.value)}
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
        <Label htmlFor="settings-shop-slug">Studio URL</Label>
        <Input id="settings-shop-slug" value={studioPath(defaults.shopSlug)} readOnly disabled />
        <p className="text-muted-foreground text-xs">
          Slug is locked once chosen — changing it would break existing bookmarks.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="settings-location">Location</Label>
        <Input
          id="settings-location"
          name="location"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
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
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={4}
          placeholder="A short introduction to you and your craft."
          aria-invalid={fieldError('bio') ? true : undefined}
        />
        {fieldError('bio') && <p className="text-destructive text-xs">{fieldError('bio')}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="settings-policies">Studio policies</Label>
        <Textarea
          id="settings-policies"
          name="policies"
          value={policies}
          onChange={(e) => setPolicies(e.target.value)}
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

      <Button type="submit" size="lg" disabled={isPending}>
        {isPending ? 'Saving…' : 'Save changes'}
      </Button>
    </form>
  );
}
