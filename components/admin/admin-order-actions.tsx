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
import { adminForceCancel, adminForceComplete, resolveDispute } from '@/lib/actions/orders';
import type { OrderStatus as Status } from '@/lib/orders/types';

type Resolution = 'resolved_for_buyer' | 'resolved_for_seller' | 'resolved_neutral';

const RESOLUTION_OPTIONS: readonly { value: Resolution; label: string; description: string }[] = [
  {
    value: 'resolved_for_buyer',
    label: 'For buyer',
    description:
      'The order is cancelled. If it had not shipped yet, the stock returns to the catalog.',
  },
  {
    value: 'resolved_for_seller',
    label: 'For seller',
    description: 'The order is marked completed. The stock stays spent, counted as a normal sale.',
  },
  {
    value: 'resolved_neutral',
    label: 'Neutral (no clear fault)',
    description:
      'If the order had shipped, it is marked completed. If not, it is cancelled and the stock returns.',
  },
];

// Action surface keyed to order status.
//  - disputed → resolve (3-way) + decide what to write to the order
//  - shipped → force-complete (when admin verifies delivery happened)
//  - any other non-terminal → force-cancel (seller terminated, fraud, etc.)
//  - terminal → no actions
export function AdminOrderActions({ orderId, status }: { orderId: string; status: Status }) {
  if (status === 'disputed') {
    return <ResolveDisputeForm orderId={orderId} />;
  }
  if (status === 'shipped') {
    return (
      <div className="flex flex-wrap gap-2">
        <ForceCompleteButton orderId={orderId} />
        <ForceCancelButton orderId={orderId} />
      </div>
    );
  }
  if (
    status === 'pending_seller_response' ||
    status === 'pending_payment_arrangement' ||
    status === 'payment_received'
  ) {
    return <ForceCancelButton orderId={orderId} />;
  }
  return null;
}

function ResolveDisputeForm({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [resolution, setResolution] = useState<Resolution>('resolved_neutral');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const remaining = 20 - text.trim().length;
  const canSubmit = !pending && remaining <= 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    startTransition(async () => {
      const result = await resolveDispute({
        orderId,
        resolution,
        adminResolution: text.trim(),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border-destructive/30 bg-destructive/5 space-y-4 rounded-md border p-4"
    >
      <h2 className="text-sm font-medium tracking-wide uppercase">Resolve dispute</h2>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Outcome</legend>
        <div className="space-y-1.5">
          {RESOLUTION_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className="border-input hover:bg-secondary/40 has-checked:bg-secondary/60 has-checked:border-foreground/40 flex cursor-pointer items-start gap-3 rounded-md border p-2.5 text-sm transition-colors"
            >
              <input
                type="radio"
                name="resolution"
                value={opt.value}
                checked={resolution === opt.value}
                onChange={() => setResolution(opt.value)}
                className="mt-1"
              />
              <div>
                <p className="font-medium">{opt.label}</p>
                <p className="text-muted-foreground text-xs">{opt.description}</p>
              </div>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="space-y-2">
        <Label htmlFor="admin-resolution">Resolution notes</Label>
        <Textarea
          id="admin-resolution"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What did you decide and why. Visible to both parties."
          minLength={20}
          maxLength={2000}
          rows={4}
        />
        <p className="text-muted-foreground text-xs">
          {remaining > 0
            ? `${remaining} more character${remaining === 1 ? '' : 's'} needed`
            : `${text.trim().length} / 2000 characters`}
        </p>
      </div>

      {error && (
        <p className="text-destructive bg-destructive/10 rounded-md p-2 text-sm" role="alert">
          {error}
        </p>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={!canSubmit}>
          {pending ? 'Resolving…' : 'Resolve dispute'}
        </Button>
      </div>
    </form>
  );
}

function ForceCancelButton({ orderId }: { orderId: string }) {
  return (
    <ForceActionButton
      orderId={orderId}
      label="Force cancel"
      variant="destructive"
      title="Force-cancel this order"
      description="The buyer and seller see the order as cancelled. Stock returns if the order hasn't shipped yet. Use this only when normal channels have failed (terminated seller, confirmed fraud, etc.)."
      action={async (input) => adminForceCancel(input)}
    />
  );
}

function ForceCompleteButton({ orderId }: { orderId: string }) {
  return (
    <ForceActionButton
      orderId={orderId}
      label="Force complete"
      variant="outline"
      title="Force-complete this order"
      description="Marks the order as completed without buyer confirmation. Use when the package was delivered and the buyer never marked received."
      action={async (input) => adminForceComplete(input)}
    />
  );
}

interface ForceActionProps {
  orderId: string;
  label: string;
  variant: 'destructive' | 'outline';
  title: string;
  description: string;
  action: (input: { orderId: string; reason: string }) => Promise<{ ok: boolean; error?: string }>;
}

function ForceActionButton({
  orderId,
  label,
  variant,
  title,
  description,
  action,
}: ForceActionProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const remaining = 20 - reason.trim().length;
  const canSubmit = !pending && remaining <= 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    startTransition(async () => {
      const result = await action({ orderId, reason: reason.trim() });
      if (!result.ok) {
        setError(result.error ?? 'Action failed');
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>{description}</DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-4">
              <Label htmlFor="force-reason">Reason (visible to both parties)</Label>
              <Textarea
                id="force-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={4}
                minLength={20}
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
              <Button type="submit" variant={variant} disabled={!canSubmit}>
                {pending ? 'Submitting…' : label}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
