'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { updateArtisanProfileAction } from '@/lib/actions/artisan';

// Owner-only on-page editor for the studio identity fields (T2). Policies
// stay in dashboard settings — this dialog is the public face of the studio,
// not the shop paperwork. The shared server action leaves unsubmitted fields
// untouched, so the two surfaces can't clobber each other.
export function EditStudioDialog({
  defaults,
}: {
  defaults: {
    shopName: string;
    location: string | null;
    bio: string | null;
    craftTags: string[] | null;
    externalLinks: {
      instagram?: string;
      facebook?: string;
      tiktok?: string;
      website?: string;
    } | null;
  };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  function fieldError(name: string): string | undefined {
    return fieldErrors[name]?.[0];
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Edit studio
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <form
            noValidate
            action={(formData) => {
              setError(null);
              setFieldErrors({});
              startTransition(async () => {
                const result = await updateArtisanProfileAction(formData);
                if (!result.ok) {
                  setError(result.error);
                  setFieldErrors(result.fieldErrors ?? {});
                  return;
                }
                setOpen(false);
                router.refresh();
              });
            }}
          >
            <DialogHeader>
              <DialogTitle>Edit studio</DialogTitle>
              <DialogDescription>
                What visitors see on your studio page. Empty fields simply don&rsquo;t appear.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="studio-name">Studio name</Label>
                <Input
                  id="studio-name"
                  name="shopName"
                  required
                  minLength={2}
                  maxLength={80}
                  defaultValue={defaults.shopName}
                  aria-invalid={fieldError('shopName') ? true : undefined}
                />
                {fieldError('shopName') && (
                  <p className="text-destructive text-xs">{fieldError('shopName')}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="studio-location">Location</Label>
                <Input
                  id="studio-location"
                  name="location"
                  maxLength={120}
                  placeholder="e.g. Quezon City"
                  defaultValue={defaults.location ?? ''}
                  aria-invalid={fieldError('location') ? true : undefined}
                />
                {fieldError('location') && (
                  <p className="text-destructive text-xs">{fieldError('location')}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="studio-bio">Your story</Label>
                <Textarea
                  id="studio-bio"
                  name="bio"
                  rows={6}
                  maxLength={5000}
                  placeholder="Who you are, what you make, and how you came to make it. Paragraphs are kept."
                  defaultValue={defaults.bio ?? ''}
                  aria-invalid={fieldError('bio') ? true : undefined}
                />
                {fieldError('bio') && (
                  <p className="text-destructive text-xs">{fieldError('bio')}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="studio-tags">Craft (comma-separated, up to 6)</Label>
                <Input
                  id="studio-tags"
                  name="craftTags"
                  placeholder="pottery, stoneware, glazing"
                  defaultValue={defaults.craftTags?.join(', ') ?? ''}
                  aria-invalid={fieldError('craftTags') ? true : undefined}
                />
                {fieldError('craftTags') && (
                  <p className="text-destructive text-xs">{fieldError('craftTags')}</p>
                )}
              </div>

              <fieldset className="space-y-3 rounded-md border p-4">
                <legend className="text-sm font-medium">Links</legend>
                <p className="text-muted-foreground text-xs">
                  Full https:// URLs. These appear as plain links under your name.
                </p>
                {(
                  [
                    { name: 'instagram', label: 'Instagram' },
                    { name: 'facebook', label: 'Facebook' },
                    { name: 'tiktok', label: 'TikTok' },
                    { name: 'website', label: 'Website' },
                  ] as const
                ).map((link) => (
                  <div key={link.name} className="space-y-1">
                    <Label htmlFor={`studio-link-${link.name}`} className="text-xs">
                      {link.label}
                    </Label>
                    <Input
                      id={`studio-link-${link.name}`}
                      name={link.name}
                      type="url"
                      placeholder={`https://…`}
                      defaultValue={defaults.externalLinks?.[link.name] ?? ''}
                      aria-invalid={fieldError(link.name) ? true : undefined}
                    />
                    {fieldError(link.name) && (
                      <p className="text-destructive text-xs">{fieldError(link.name)}</p>
                    )}
                  </div>
                ))}
              </fieldset>

              {error && (
                <p role="alert" className="text-destructive text-sm">
                  {error}
                </p>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Saving…' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
