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
import { blockBuyer, unblockBuyer } from '@/lib/actions/messaging';

export function BlockBuyerButton({
  buyerUserId,
  alreadyBlocked,
}: {
  buyerUserId: string;
  alreadyBlocked: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      try {
        const result = alreadyBlocked
          ? await unblockBuyer({ blockedUserId: buyerUserId })
          : await blockBuyer({ blockedUserId: buyerUserId });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setOpen(false);
        router.refresh();
      } catch {
        setError('Something went wrong. Please try again in a moment.');
      }
    });
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        {alreadyBlocked ? 'Unblock this buyer' : 'Block this buyer'}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {alreadyBlocked ? 'Unblock this buyer?' : 'Block this buyer?'}
            </DialogTitle>
            <DialogDescription>
              {alreadyBlocked
                ? 'You and this buyer will be able to message each other on pre-purchase threads again.'
                : 'Pauses messaging in both directions on pre-purchase threads — neither of you can send, and they cannot start new conversations, until you unblock. Existing orders between you continue normally.'}
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p
              className="text-destructive bg-destructive/10 mt-2 rounded-md p-2 text-sm"
              role="alert"
            >
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant={alreadyBlocked ? 'default' : 'destructive'}
              onClick={handleSubmit}
              disabled={pending}
            >
              {pending ? 'Saving…' : alreadyBlocked ? 'Unblock' : 'Block'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
