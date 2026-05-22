'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { createPrePurchaseThread } from '@/lib/actions/messaging';

export function AskTheMakerButton({
  productId,
  signedIn,
  productUrl,
}: {
  productId: string;
  signedIn: boolean;
  productUrl: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    if (!signedIn) {
      router.push(`/sign-in?next=${encodeURIComponent(productUrl)}`);
      return;
    }
    setOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending || body.trim().length === 0) return;
    setError(null);
    startTransition(async () => {
      const result = await createPrePurchaseThread({
        productId,
        initialMessage: body.trim(),
        idempotencyKey: crypto.randomUUID(),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/account/messages/${result.data.threadId}`);
    });
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={handleClick}>
        Ask the maker
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Ask the maker</DialogTitle>
              <DialogDescription>
                Send a question about this piece. Makers usually reply within a day or two.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-4">
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="What would you like to ask?"
                rows={4}
                maxLength={2000}
                autoFocus
              />
              {error && (
                <p
                  className="text-destructive bg-destructive/10 rounded-md p-2 text-sm"
                  role="alert"
                >
                  {error}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending || body.trim().length === 0}>
                {pending ? 'Sending…' : 'Send'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
