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
import { cancelAsBuyer, markReceived } from '@/lib/actions/orders';

type Status =
  | 'pending_seller_response'
  | 'pending_payment_arrangement'
  | 'payment_received'
  | 'shipped'
  | 'completed'
  | 'cancelled_by_buyer'
  | 'cancelled_by_seller'
  | 'auto_cancelled'
  | 'disputed';

const BUYER_CANCEL_REASONS = [
  { value: 'buyer_changed_mind', label: 'I changed my mind' },
  { value: 'payment_disagreement', label: "We couldn't agree on payment" },
  { value: 'shipping_disagreement', label: "We couldn't agree on shipping" },
  { value: 'other', label: 'Other (explain in notes)' },
] as const;

type ReasonValue = (typeof BUYER_CANCEL_REASONS)[number]['value'];

// Buyer-side actions are narrower than the seller surface — only cancel
// (pre-shipment) and mark-received (from shipped). Phase 5 builds the
// full buyer order management; this is the minimum to make the lifecycle
// testable end-to-end after Phase 4 lands.
export function BuyerOrderActionButtons({ orderId, status }: { orderId: string; status: Status }) {
  if (status === 'pending_seller_response' || status === 'pending_payment_arrangement') {
    return <CancelButton orderId={orderId} />;
  }
  if (status === 'shipped') {
    return <MarkReceivedButton orderId={orderId} />;
  }
  // `payment_received` and `shipped`-after-buyer-cancel-attempt: no
  // unilateral buyer cancel — the buyer must dispute (Phase 8). For
  // `completed` and terminal cancelled states: no actions.
  return null;
}

function MarkReceivedButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleMarkReceived() {
    setError(null);
    startTransition(async () => {
      const result = await markReceived({ orderId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button onClick={handleMarkReceived} disabled={pending}>
        {pending ? 'Saving…' : 'Mark as received'}
      </Button>
      {error && (
        <p
          className="text-destructive bg-destructive/10 w-full rounded-md p-2 text-sm"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  );
}

function CancelButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState<ReasonValue>(BUYER_CANCEL_REASONS[0].value);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await cancelAsBuyer({
        orderId,
        reason,
        notes: notes.trim() || undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" onClick={() => setOpen(true)} disabled={pending}>
        Cancel order
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Cancel this order?</DialogTitle>
              <DialogDescription>
                The seller will see your cancellation reason. You can place a new order later if you
                change your mind.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Reason</legend>
                <div className="space-y-1.5">
                  {BUYER_CANCEL_REASONS.map((r) => (
                    <label
                      key={r.value}
                      className="border-input hover:bg-secondary/40 has-checked:bg-secondary/60 has-checked:border-foreground/40 flex cursor-pointer items-start gap-3 rounded-md border p-2.5 text-sm transition-colors"
                    >
                      <input
                        type="radio"
                        name="reason"
                        value={r.value}
                        checked={reason === r.value}
                        onChange={() => setReason(r.value)}
                        className="mt-1"
                      />
                      <span>{r.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="space-y-2">
                <Label htmlFor="buyer-cancel-notes">Notes (optional)</Label>
                <Textarea
                  id="buyer-cancel-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Anything the seller should know."
                  maxLength={1000}
                  rows={3}
                />
              </div>
              {error && (
                <p
                  className="text-destructive bg-destructive/10 w-full rounded-md p-2 text-sm"
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
              <Button type="submit" variant="destructive" disabled={pending}>
                {pending ? 'Cancelling…' : 'Cancel order'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
