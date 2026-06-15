'use client';

import { useState, useTransition } from 'react';
import { usePathname } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { submitFeedbackAction } from '@/lib/actions/feedback';

const CATEGORIES = [
  { value: 'bug', label: 'Something is broken' },
  { value: 'idea', label: 'An idea' },
  { value: 'confusing', label: 'Something is confusing' },
  { value: 'other', label: 'Other' },
] as const;

export function FeedbackDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const pathname = usePathname();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();
  // Bumped on close to remount the form so the uncontrolled textarea clears —
  // without this, a reopen during the dialog's exit animation shows stale text.
  const [formKey, setFormKey] = useState(0);

  function handleOpenChange(next: boolean) {
    if (!next) {
      // Reset on close so a reopen starts clean.
      setError(null);
      setDone(false);
      setFormKey((k) => k + 1);
    }
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send feedback</DialogTitle>
          <DialogDescription>We read every message.</DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="space-y-4">
            <p className="text-sm leading-relaxed">Thank you — we read every message.</p>
            <DialogFooter>
              <Button type="button" onClick={() => handleOpenChange(false)}>
                Close
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form
            key={formKey}
            noValidate
            action={(formData) => {
              setError(null);
              const category = String(formData.get('category') ?? '');
              const message = String(formData.get('message') ?? '');
              startTransition(async () => {
                const result = await submitFeedbackAction({ category, message, route: pathname });
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                setDone(true);
              });
            }}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="feedback-category">What&apos;s this about?</Label>
              <select
                id="feedback-category"
                name="category"
                defaultValue="bug"
                // Copies the focus-visible ring, border, and dark-mode tokens from
                // Input so the native select matches Textarea/Input in both themes.
                className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 h-8 w-full rounded-lg border px-2.5 text-sm outline-none transition-colors focus-visible:ring-3"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="feedback-message">Message</Label>
              <Textarea id="feedback-message" name="message" rows={5} maxLength={2000} required />
            </div>

            {error && (
              <p role="alert" className="text-destructive text-xs">
                {error}
              </p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => handleOpenChange(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Sending…' : 'Send'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
