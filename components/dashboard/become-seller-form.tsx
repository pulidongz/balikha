'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { becomeArtisanAction } from '@/lib/actions/artisan';

export function BecomeSellerForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Generated once when the form mounts. Carries through every retry of
  // this form session — so a double-click or network-retry within 24h
  // returns the cached response (the artisan profile from the first
  // attempt) instead of re-creating. New page mount → new key → new
  // chance to actually try again.
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  return (
    <form
      noValidate
      className="space-y-4"
      action={(formData) => {
        setError(null);
        // Inject the per-mount key into the FormData. Server schema
        // validates as a UUID via lib/validators/_shared.ts.
        formData.set('idempotencyKey', idempotencyKey);
        startTransition(async () => {
          const result = await becomeArtisanAction(formData);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          router.refresh();
        });
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="shop-name">Shop name</Label>
        <Input
          id="shop-name"
          name="shopName"
          required
          minLength={2}
          maxLength={80}
          placeholder="e.g. Maria's Pottery"
          autoComplete="organization"
        />
        <p className="text-muted-foreground text-xs">
          This is the public name buyers will see. Your shop URL is generated automatically.
        </p>
      </div>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" disabled={isPending}>
        {isPending ? 'Creating shop…' : 'Become a seller'}
      </Button>
    </form>
  );
}
