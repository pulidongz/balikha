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
import { fileDispute, respondToDispute } from '@/lib/actions/orders';
import type { OrderStatus as Status } from '@/lib/orders/types';

// "Report a problem" appears on every non-terminal, non-disputed order
// for either party. Once an order is `disputed`, the same surface
// switches to a "Respond" form for the non-filer (and a read-only
// "you filed this" indicator for the filer).
export function FileDisputeButton({ orderId, status }: { orderId: string; status: Status }) {
  // Non-terminal-non-disputed only. Terminal cancelled states and
  // completed don't accept disputes today (Issue 20 — late disputes
  // are a deferred policy decision).
  const canFile =
    status === 'pending_seller_response' ||
    status === 'pending_payment_arrangement' ||
    status === 'payment_received' ||
    status === 'shipped';
  if (!canFile) return null;
  return <FileDisputeInner orderId={orderId} />;
}

function FileDisputeInner({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const remaining = 30 - reason.trim().length;
  const canSubmit = !pending && remaining <= 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    startTransition(async () => {
      const result = await fileDispute({ orderId, reason: reason.trim() });
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
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-muted-foreground hover:text-destructive text-xs underline-offset-4 hover:underline"
      >
        Report a problem
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Report a problem with this order</DialogTitle>
              <DialogDescription>
                A Balikha admin will review and reach out. This may affect both parties&rsquo;
                reputation. Be specific — what went wrong, what you&rsquo;ve tried, what you&rsquo;d
                consider a fair resolution.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-4">
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="What happened?"
                rows={5}
                minLength={30}
                maxLength={2000}
                autoFocus
              />
              <p className="text-muted-foreground text-xs">
                {remaining > 0
                  ? `${remaining} more character${remaining === 1 ? '' : 's'} needed`
                  : `${reason.trim().length} / 2000 characters`}
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
                Back
              </Button>
              <Button type="submit" variant="destructive" disabled={!canSubmit}>
                {pending ? 'Submitting…' : 'File dispute'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Non-filer's "respond" prompt on the disputed-order page. The filer's
// statement is already visible on the page; this lets the other party
// add their side so admin sees both positions before resolving.
export function RespondToDisputeButton({
  orderId,
  hasResponse,
  responderLabel,
}: {
  orderId: string;
  hasResponse: boolean;
  responderLabel: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [statement, setStatement] = useState('');
  const [error, setError] = useState<string | null>(null);

  const remaining = 30 - statement.trim().length;
  const canSubmit = !pending && remaining <= 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    startTransition(async () => {
      const result = await respondToDispute({ orderId, statement: statement.trim() });
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
        {hasResponse ? `Update your statement` : `Respond as ${responderLabel}`}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Add your statement</DialogTitle>
              <DialogDescription>
                The other party will see this, and so will Balikha admin. Be specific and factual;
                admin uses both statements to decide.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-4">
              <Textarea
                value={statement}
                onChange={(e) => setStatement(e.target.value)}
                placeholder="Your side of what happened."
                rows={5}
                minLength={30}
                maxLength={2000}
                autoFocus
              />
              <p className="text-muted-foreground text-xs">
                {remaining > 0
                  ? `${remaining} more character${remaining === 1 ? '' : 's'} needed`
                  : `${statement.trim().length} / 2000 characters`}
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
                Back
              </Button>
              <Button type="submit" disabled={!canSubmit}>
                {pending ? 'Saving…' : 'Submit statement'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
