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
  deleteArtisanBannerAction,
  setArtisanCoverFocusAction,
  uploadArtisanBannerAction,
} from '@/lib/actions/artisan';

type CoverFocus = 'top' | 'center' | 'bottom';

const FOCUS_OPTIONS: ReadonlyArray<{ value: CoverFocus; label: string }> = [
  { value: 'top', label: 'Top' },
  { value: 'center', label: 'Center' },
  { value: 'bottom', label: 'Bottom' },
];

// Owner-only cover controls on the studio page (T2): upload a new cover,
// pick its vertical framing (the "crop"), or remove it. The framing radio
// applies immediately — it's a reversible single-value toggle, and a Save
// button for one radio would be ceremony.
export function CoverEditDialog({
  hasCover,
  coverFocus,
}: {
  hasCover: boolean;
  coverFocus: CoverFocus;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [focusPending, startFocusTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        className="bg-background/80 backdrop-blur-xs"
        onClick={() => setOpen(true)}
      >
        Edit cover
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cover image</DialogTitle>
            <DialogDescription>
              Wide aspect (around 16:5) works best — the page crops to 16:6 on mobile and 16:4 on
              desktop.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
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
                  setOpen(false);
                  router.refresh();
                });
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="cover-file">Upload (PNG, JPEG, or WebP — up to 8 MB)</Label>
                <Input
                  id="cover-file"
                  name="banner"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  required
                />
              </div>
              <Button type="submit" disabled={isPending} variant="outline" size="sm">
                {isPending ? 'Uploading…' : 'Upload cover'}
              </Button>
            </form>

            {hasCover && (
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Framing</legend>
                <p className="text-muted-foreground text-xs">
                  Which part of the image stays visible in the crop.
                </p>
                <div className="flex gap-2">
                  {FOCUS_OPTIONS.map((opt) => (
                    <Button
                      key={opt.value}
                      type="button"
                      size="sm"
                      variant={coverFocus === opt.value ? 'default' : 'outline'}
                      disabled={focusPending}
                      onClick={() => {
                        setError(null);
                        startFocusTransition(async () => {
                          const result = await setArtisanCoverFocusAction(opt.value);
                          if (!result.ok) {
                            setError(result.error);
                            return;
                          }
                          router.refresh();
                        });
                      }}
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>
              </fieldset>
            )}

            {error && (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            )}

            {hasCover && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => setRemoveOpen(true)}
              >
                Remove cover
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        title="Remove the cover image?"
        description="This takes the cover off your studio page right away. You can upload a new one anytime, but the current image cannot be restored."
        confirmLabel="Remove cover"
        pendingLabel="Removing…"
        destructive
        onConfirm={() => deleteArtisanBannerAction()}
        onSuccess={() => {
          setOpen(false);
          router.refresh();
        }}
      />
    </>
  );
}
