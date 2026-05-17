'use client';

import Image from 'next/image';
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { deleteArtisanBannerAction, uploadArtisanBannerAction } from '@/lib/actions/artisan';

export function BannerUploader({ currentUrl }: { currentUrl: string | null }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);

  return (
    <div className="space-y-4">
      {currentUrl ? (
        <div className="bg-secondary relative aspect-[16/5] w-full overflow-hidden rounded-md border">
          <Image
            src={currentUrl}
            alt="Current banner"
            fill
            sizes="(min-width: 768px) 600px, 100vw"
            className="object-cover"
          />
        </div>
      ) : (
        <div className="bg-secondary text-muted-foreground flex aspect-[16/5] w-full items-center justify-center rounded-md border border-dashed text-sm">
          No banner uploaded yet
        </div>
      )}

      <form
        ref={formRef}
        className="space-y-3"
        action={(formData) => {
          setError(null);
          startTransition(async () => {
            const result = await uploadArtisanBannerAction(formData);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            formRef.current?.reset();
            router.refresh();
          });
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="banner-file">Upload a new banner (PNG, JPEG, or WebP — up to 8 MB)</Label>
          <Input
            id="banner-file"
            name="banner"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            required
          />
          <p className="text-muted-foreground text-xs">
            Wide aspect (around 16:5) works best — the storefront crops to 16:6 on mobile and 16:4
            on desktop.
          </p>
        </div>
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={isPending} variant="outline">
            {isPending ? 'Uploading…' : 'Upload banner'}
          </Button>
          {currentUrl && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setRemoveOpen(true)}
              disabled={isPending}
              className="text-destructive hover:text-destructive"
            >
              Remove current banner
            </Button>
          )}
        </div>
      </form>

      <ConfirmDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        title="Remove the current banner?"
        description="This takes the banner off your storefront right away. You can upload a new one anytime, but the current image cannot be restored."
        confirmLabel="Remove banner"
        pendingLabel="Removing…"
        destructive
        onConfirm={() => deleteArtisanBannerAction()}
        onSuccess={() => router.refresh()}
      />
    </div>
  );
}
