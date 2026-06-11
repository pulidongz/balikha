'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  deleteArtisanProfilePhotoAction,
  uploadArtisanProfilePhotoAction,
} from '@/lib/actions/artisan';

// Owner-only profile photo controls on the studio page (T2). Square-ish
// images work best; the avatar crops to a circle.
export function PhotoEditDialog({ hasPhoto }: { hasPhoto: boolean }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <Button
        variant="secondary"
        size="xs"
        className="bg-background/80 backdrop-blur-xs"
        onClick={() => setOpen(true)}
        aria-label="Edit profile photo"
      >
        Edit photo
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Profile photo</DialogTitle>
            <DialogDescription>
              A square image works best — it displays as a circle. You, your hands at work, or a
              mark that stands for your studio.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            <form
              ref={formRef}
              className="space-y-3"
              action={(formData) => {
                setError(null);
                startTransition(async () => {
                  const result = await uploadArtisanProfilePhotoAction(formData);
                  if (!result.ok) {
                    setError(result.error);
                    return;
                  }
                  formRef.current?.reset();
                  setOpen(false);
                  router.refresh();
                });
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="photo-file">Upload (PNG, JPEG, or WebP — up to 4 MB)</Label>
                <Input
                  id="photo-file"
                  name="photo"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  required
                />
              </div>
              <Button type="submit" disabled={isPending} variant="outline" size="sm">
                {isPending ? 'Uploading…' : 'Upload photo'}
              </Button>
            </form>

            {error && (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            )}

            {hasPhoto && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => setRemoveOpen(true)}
              >
                Remove photo
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        title="Remove your profile photo?"
        description="Your initials will show in its place until you upload a new one."
        confirmLabel="Remove photo"
        pendingLabel="Removing…"
        destructive
        onConfirm={() => deleteArtisanProfilePhotoAction()}
        onSuccess={() => {
          setOpen(false);
          router.refresh();
        }}
      />
    </>
  );
}
