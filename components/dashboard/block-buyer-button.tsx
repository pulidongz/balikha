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
      const result = alreadyBlocked
        ? await unblockBuyer({ blockedUserId: buyerUserId })
        : await blockBuyer({ blockedUserId: buyerUserId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
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
                ? 'They will be able to start new conversations with you again.'
                : 'They will not be able to start new conversations or send new messages. Existing orders between you continue normally.'}
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
