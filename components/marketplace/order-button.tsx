'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { placeOrder } from '@/lib/actions/orders';

interface AddressOption {
  id: string;
  label: string | null;
  recipientName: string;
  line1: string;
  city: string;
  province: string;
}

interface OrderButtonProps {
  productId: string;
  productTitle: string;
  formattedPrice: string;
  shopName: string;
  // 'in_stock' = render the dialog trigger; 'sold_out' = render disabled label;
  // 'own_product' = render "Your listing"; 'signed_out' = link to sign-in.
  state: 'in_stock' | 'sold_out' | 'own_product' | 'signed_out';
  addresses: AddressOption[];
  defaultAddressId: string | null;
  signInRedirect?: string;
}

export function OrderButton(props: OrderButtonProps) {
  if (props.state === 'sold_out') {
    return <DisabledStateButton label="Sold out" title="This piece is sold out" />;
  }
  if (props.state === 'own_product') {
    return <DisabledStateButton label="Your listing" title="You can't order your own product" />;
  }
  if (props.state === 'signed_out') {
    return (
      <Link
        href={`/sign-in${props.signInRedirect ? `?next=${encodeURIComponent(props.signInRedirect)}` : ''}`}
        className={buttonVariants({ size: 'lg', className: 'flex-1 md:flex-none' })}
      >
        Sign in to order
      </Link>
    );
  }
  return <OrderDialog {...props} />;
}

function DisabledStateButton({ label, title }: { label: string; title: string }) {
  return (
    <button
      type="button"
      disabled
      className={buttonVariants({
        size: 'lg',
        className: 'flex-1 cursor-not-allowed md:flex-none',
      })}
      aria-disabled="true"
      title={title}
    >
      {label}
    </button>
  );
}

function OrderDialog(props: OrderButtonProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Reorder flow: ReorderButton routes here with ?reorder=1. We open
  // the dialog by deriving the INITIAL state from the URL via lazy
  // useState init (computed once at mount). The follow-up effect just
  // strips the param so a refresh doesn't reopen — no setState inside
  // an effect (react-hooks/set-state-in-effect).
  const [open, setOpen] = useState<boolean>(() => searchParams.get('reorder') === '1');
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (searchParams.get('reorder') === '1') {
      const next = new URLSearchParams(searchParams.toString());
      next.delete('reorder');
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    }
  }, [searchParams, pathname, router]);

  // Form state. Default address pre-selected so the common case is one click.
  const [addressId, setAddressId] = useState<string>(
    props.defaultAddressId ?? props.addresses[0]?.id ?? '',
  );
  const [notes, setNotes] = useState('');
  const [understood, setUnderstood] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const noAddresses = props.addresses.length === 0;
  const canSubmit = !pending && understood && addressId !== '' && !noAddresses;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);

    // Idempotency key generated client-side so a network blip + retry
    // dedups via the wrapper + advisory lock pattern in the server action.
    const idempotencyKey = crypto.randomUUID();

    startTransition(async () => {
      const result = await placeOrder({
        productId: props.productId,
        shippingAddressId: addressId,
        notesFromBuyer: notes.trim() || undefined,
        idempotencyKey,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Redirect to the order detail page. router.push is a Next-side
      // navigation, no full reload — the order list/detail will read
      // fresh data because we just wrote to it.
      router.push(`/account/orders/${result.data.orderId}`);
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="lg" className="flex-1 md:flex-none">
            Order
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Order this piece</DialogTitle>
            <DialogDescription>
              {props.productTitle} from {props.shopName} · {props.formattedPrice}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-4">
            {noAddresses ? (
              <div className="bg-muted text-muted-foreground rounded-md p-3 text-sm">
                You need a shipping address before you can order.{' '}
                <Link
                  href="/account/addresses"
                  className="text-foreground underline-offset-4 hover:underline"
                >
                  Add an address
                </Link>{' '}
                first, then come back.
              </div>
            ) : (
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Ship to</legend>
                <div className="space-y-2">
                  {props.addresses.map((a) => (
                    <label
                      key={a.id}
                      className="border-input hover:bg-secondary/40 has-checked:bg-secondary/60 has-checked:border-foreground/40 flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors"
                    >
                      <input
                        type="radio"
                        name="shippingAddressId"
                        value={a.id}
                        checked={addressId === a.id}
                        onChange={() => setAddressId(a.id)}
                        className="mt-1"
                      />
                      <div className="text-sm">
                        <p className="font-medium">
                          {a.recipientName}
                          {a.label ? (
                            <span className="text-muted-foreground"> · {a.label}</span>
                          ) : null}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {a.line1}, {a.city}, {a.province}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            <div className="space-y-2">
              <Label htmlFor="notes-from-buyer">Note to seller (optional)</Label>
              <Textarea
                id="notes-from-buyer"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Anything the seller should know — special handling, delivery preference, etc."
                maxLength={2000}
                rows={3}
              />
            </div>

            <label className="flex cursor-pointer gap-3 text-sm">
              <input
                type="checkbox"
                checked={understood}
                onChange={(e) => setUnderstood(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                I understand I&rsquo;ll arrange payment with the seller directly. Balikha
                doesn&rsquo;t hold payment, and the seller may decline if payment can&rsquo;t be
                worked out.
              </span>
            </label>

            {error && (
              <p className="text-destructive bg-destructive/10 rounded-md p-2 text-sm" role="alert">
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
            <Button type="submit" disabled={!canSubmit}>
              {pending ? 'Placing…' : 'Place order'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
