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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { flagListing, removeListing, reinstateListing } from '@/lib/actions/admin-products';

type ModerationStatus = 'none' | 'flagged' | 'removed';

// Renders available moderation transitions based on the current moderationStatus:
//   none    → Flag + Remove
//   flagged → Remove + Reinstate
//   removed → Reinstate
export function AdminProductActions({
  productId,
  moderationStatus,
}: {
  productId: string;
  moderationStatus: ModerationStatus;
}) {
  if (moderationStatus === 'none') {
    return (
      <div className="flex flex-wrap gap-2">
        <FlagButton productId={productId} />
        <RemoveButton productId={productId} />
      </div>
    );
  }
  if (moderationStatus === 'flagged') {
    return (
      <div className="flex flex-wrap gap-2">
        <RemoveButton productId={productId} />
        <ReinstateButton productId={productId} />
      </div>
    );
  }
  if (moderationStatus === 'removed') {
    return (
      <div className="flex flex-wrap gap-2">
        <ReinstateButton productId={productId} />
      </div>
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// Flag — requires reason
// ---------------------------------------------------------------------------

function FlagButton({ productId }: { productId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!reason.trim()) {
      setError('Reason is required.');
      return;
    }
    startTransition(async () => {
      const result = await flagListing({ productId, reason: reason.trim() });
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
      <Button variant="outline" onClick={() => setOpen(true)}>
        Flag
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Flag listing</DialogTitle>
              <DialogDescription>
                The listing stays live but is marked for admin attention. No seller notification is
                sent.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-4">
              <Label htmlFor="flag-reason">Reason (internal)</Label>
              <Textarea
                id="flag-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Required — recorded in the audit log."
                rows={3}
                maxLength={2000}
                autoFocus
              />
              <p className="text-muted-foreground text-xs">
                {reason.trim().length > 0
                  ? `${reason.trim().length} / 2000 characters`
                  : 'Required.'}
              </p>
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
              <Button type="submit" variant="outline" disabled={pending}>
                {pending ? 'Flagging…' : 'Flag listing'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Remove — requires reason; notifies seller
// ---------------------------------------------------------------------------

function RemoveButton({ productId }: { productId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!reason.trim()) {
      setError('Reason is required.');
      return;
    }
    startTransition(async () => {
      const result = await removeListing({ productId, reason: reason.trim() });
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
      <Button variant="destructive" onClick={() => setOpen(true)}>
        Remove
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Remove listing</DialogTitle>
              <DialogDescription>
                The listing will be unpublished and the seller will be notified with the reason.
                This can be reversed via Reinstate.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-4">
              <Label htmlFor="remove-reason">Reason (shown to seller)</Label>
              <Textarea
                id="remove-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Required — sent to the seller in a notification and email."
                rows={4}
                maxLength={2000}
                autoFocus
              />
              <p className="text-muted-foreground text-xs">
                {reason.trim().length > 0
                  ? `${reason.trim().length} / 2000 characters`
                  : 'Required.'}
              </p>
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
              <Button type="submit" variant="destructive" disabled={pending}>
                {pending ? 'Removing…' : 'Remove listing'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Reinstate — no reason required; silent for v1
// ---------------------------------------------------------------------------

function ReinstateButton({ productId }: { productId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await reinstateListing({ productId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <Button variant="outline" onClick={handleClick} disabled={pending}>
        {pending ? 'Reinstating…' : 'Reinstate'}
      </Button>
      {error && (
        <p className="text-destructive bg-destructive/10 rounded-md p-2 text-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
