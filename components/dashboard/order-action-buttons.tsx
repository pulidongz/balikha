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
import {
  acceptOrder,
  cancelAsSeller,
  declineOrder,
  markPaymentReceived,
  markShipped,
} from '@/lib/actions/orders';
import type { OrderStatus as Status } from '@/lib/orders/types';

// Two flavors of reason picker — declines from pending_seller_response,
// and cancellations from later in the flow. The set of valid reasons
// differs slightly but we keep the same shape.
const DECLINE_REASONS = [
  { value: 'seller_unable_to_fulfill', label: "I can't fulfill this right now" },
  { value: 'item_unavailable', label: 'Item no longer available' },
  { value: 'payment_disagreement', label: "We couldn't agree on payment" },
  { value: 'other', label: 'Other (explain in notes)' },
] as const;

const CANCEL_REASONS = [
  { value: 'seller_unable_to_fulfill', label: "I can't fulfill this anymore" },
  { value: 'item_unavailable', label: 'Item no longer available' },
  { value: 'payment_disagreement', label: 'Payment fell through' },
  { value: 'shipping_disagreement', label: "We couldn't agree on shipping" },
  { value: 'other', label: 'Other (explain in notes)' },
] as const;

type ReasonValue =
  | (typeof DECLINE_REASONS)[number]['value']
  | (typeof CANCEL_REASONS)[number]['value'];

interface Props {
  orderId: string;
  status: Status;
}

export function OrderActionButtons({ orderId, status }: Props) {
  if (status === 'pending_seller_response') {
    return <AcceptOrDecline orderId={orderId} />;
  }
  if (status === 'pending_payment_arrangement') {
    return <PaymentReceivedOrCancel orderId={orderId} />;
  }
  if (status === 'payment_received') {
    return <ShippedOrCancel orderId={orderId} />;
  }
  return null;
}

function AcceptOrDecline({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [declineOpen, setDeclineOpen] = useState(false);

  function handleAccept() {
    setError(null);
    startTransition(async () => {
      const result = await acceptOrder({ orderId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <ActionRow>
      <Button onClick={handleAccept} disabled={pending}>
        {pending ? 'Accepting…' : 'Accept'}
      </Button>
      <Button variant="outline" onClick={() => setDeclineOpen(true)} disabled={pending}>
        Decline
      </Button>
      {error && <ActionError>{error}</ActionError>}
      <ReasonDialog
        open={declineOpen}
        onOpenChange={setDeclineOpen}
        title="Decline this order?"
        description="The buyer will see the order as declined. Stock returns automatically; the buyer can try another piece."
        reasons={DECLINE_REASONS}
        submitLabel="Decline order"
        onSubmit={async ({ reason, notes }) => declineOrder({ orderId, reason, notes })}
      />
    </ActionRow>
  );
}

function PaymentReceivedOrCancel({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);

  function handleMarkPaid() {
    setError(null);
    startTransition(async () => {
      const result = await markPaymentReceived({ orderId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <ActionRow>
      <Button onClick={handleMarkPaid} disabled={pending}>
        {pending ? 'Saving…' : 'Mark payment received'}
      </Button>
      <Button variant="destructive" onClick={() => setCancelOpen(true)} disabled={pending}>
        Cancel order
      </Button>
      {error && <ActionError>{error}</ActionError>}
      <ReasonDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancel this order?"
        description="The buyer will see the order as cancelled and stock returns to your catalog."
        reasons={CANCEL_REASONS}
        submitLabel="Cancel order"
        onSubmit={async ({ reason, notes }) => cancelAsSeller({ orderId, reason, notes })}
      />
    </ActionRow>
  );
}

function ShippedOrCancel({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);

  function handleMarkShipped() {
    setError(null);
    startTransition(async () => {
      const result = await markShipped({ orderId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <ActionRow>
      <Button onClick={handleMarkShipped} disabled={pending}>
        {pending ? 'Saving…' : 'Mark shipped'}
      </Button>
      <Button variant="destructive" onClick={() => setCancelOpen(true)} disabled={pending}>
        Cancel order
      </Button>
      {error && <ActionError>{error}</ActionError>}
      <ReasonDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancel this order?"
        description="Cancelling at this stage means you've received payment but won't ship. The buyer expects either a refund or shipment — make sure you've coordinated."
        reasons={CANCEL_REASONS}
        submitLabel="Cancel order"
        onSubmit={async ({ reason, notes }) => cancelAsSeller({ orderId, reason, notes })}
      />
    </ActionRow>
  );
}

function ActionRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}

function ActionError({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-destructive bg-destructive/10 w-full rounded-md p-2 text-sm" role="alert">
      {children}
    </p>
  );
}

interface ReasonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  reasons: readonly { value: string; label: string }[];
  submitLabel: string;
  onSubmit: (input: {
    reason: ReasonValue;
    notes: string | undefined;
  }) => Promise<{ ok: boolean; error?: string }>;
}

function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  reasons,
  submitLabel,
  onSubmit,
}: ReasonDialogProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState<ReasonValue>(reasons[0]!.value as ReasonValue);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await onSubmit({ reason, notes: notes.trim() || undefined });
      if (!result.ok) {
        setError(result.error ?? 'Action failed');
        return;
      }
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Reason</legend>
              <div className="space-y-1.5">
                {reasons.map((r) => (
                  <label
                    key={r.value}
                    className="border-input hover:bg-secondary/40 has-checked:bg-secondary/60 has-checked:border-foreground/40 flex cursor-pointer items-start gap-3 rounded-md border p-2.5 text-sm transition-colors"
                  >
                    <input
                      type="radio"
                      name="reason"
                      value={r.value}
                      checked={reason === r.value}
                      onChange={() => setReason(r.value as ReasonValue)}
                      className="mt-1"
                    />
                    <span>{r.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="space-y-2">
              <Label htmlFor="reason-notes">Notes (optional)</Label>
              <Textarea
                id="reason-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Anything the buyer should know."
                maxLength={1000}
                rows={3}
              />
            </div>
            {error && <ActionError>{error}</ActionError>}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Back
            </Button>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? 'Submitting…' : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
