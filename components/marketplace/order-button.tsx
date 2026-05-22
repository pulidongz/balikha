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

// Seller track record, pre-formatted on the server. The product page
// builds these strings (it can read the reputation/db module); passing
// them ready-made keeps this client component from pulling the
// server-only reputation query into the client bundle. Same reasoning
// as the responseTimeLabel prop on ProductCard.
export interface SellerTrust {
  hasHistory: boolean;
  responseLine: string | null;
  fulfillmentLine: string | null;
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
  sellerTrust: SellerTrust;
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

// The four-step explainer, drawn as a quiet numbered rail. It echoes the
// OrderEventTimeline the buyer will track on their order page after
// ordering, so the dialog previews the very thing it sets in motion.
function OrderSteps({ shopName }: { shopName: string }) {
  const steps = [
    `You place this order. Nothing is charged; it goes to ${shopName} as a request.`,
    `${shopName} reviews it, then accepts or declines.`,
    `You and ${shopName} arrange payment together, directly.`,
    `${shopName} ships your piece.`,
  ];
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-medium">How ordering works</h3>
      <ol>
        {steps.map((step, i) => {
          const isLast = i === steps.length - 1;
          return (
            <li key={i} className="flex gap-3">
              <div className="flex flex-col items-center" aria-hidden="true">
                <span className="border-border text-foreground flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium tabular-nums">
                  {i + 1}
                </span>
                {!isLast && <span className="border-border w-0 flex-1 border-l" />}
              </div>
              <p className={`text-muted-foreground text-sm ${isLast ? '' : 'pb-4'}`}>{step}</p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// The seller's recent track record, or an honest note for a new seller.
// Never shows zeroed-out stats: a maker with no order history reads as
// "early days," not "0% fulfilled".
function SellerTrustBlock({ trust, shopName }: { trust: SellerTrust; shopName: string }) {
  return (
    <section className="space-y-1.5">
      <h3 className="text-sm font-medium">This seller</h3>
      {trust.hasHistory ? (
        <div className="text-muted-foreground space-y-1 text-sm">
          {trust.responseLine && <p>{trust.responseLine}</p>}
          {trust.fulfillmentLine && <p>{trust.fulfillmentLine}</p>}
          {!trust.responseLine && !trust.fulfillmentLine && (
            <p>{shopName} has handled recent orders on Balikha.</p>
          )}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          New to Balikha. You would be one of {shopName}&rsquo;s first orders.
        </p>
      )}
    </section>
  );
}

function OrderDialog(props: OrderButtonProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Reorder flow: ReorderButton routes here with ?reorder=1.
  // Thread→order flow: ThreadView's "Order this piece" CTA routes here
  // with ?threadId=<id> (§6.10a). Both auto-open the dialog by deriving
  // the INITIAL state from the URL via lazy useState init (computed once
  // at mount). The follow-up effect strips both params so a refresh
  // doesn't reopen — no setState inside an effect.
  const [open, setOpen] = useState<boolean>(
    () => searchParams.get('reorder') === '1' || searchParams.get('threadId') !== null,
  );
  // threadId carried into placeOrder. Read once at mount — the strip
  // effect below removes it from the URL, so don't re-read it later.
  const [threadId] = useState<string | null>(() => searchParams.get('threadId'));
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (searchParams.get('reorder') === '1' || searchParams.get('threadId') !== null) {
      const next = new URLSearchParams(searchParams.toString());
      next.delete('reorder');
      next.delete('threadId');
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
      try {
        const result = await placeOrder({
          productId: props.productId,
          shippingAddressId: addressId,
          notesFromBuyer: notes.trim() || undefined,
          idempotencyKey,
          threadId: threadId ?? undefined,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        // Redirect to the order detail page. If the optional thread link
        // failed (stale "Order this piece" CTA — see §4.8), surface a
        // non-blocking notice via ?threadLinkSkipped=1 so the order page
        // can tell the buyer their order placed but the conversation was
        // not attached. Order placement itself succeeded either way.
        const orderHref = result.data.threadLinkSkipped
          ? `/account/orders/${result.data.orderId}?threadLinkSkipped=1`
          : `/account/orders/${result.data.orderId}`;
        router.push(orderHref);
        setOpen(false);
      } catch {
        // placeOrder re-throws unexpected (non-business) failures so a
        // transient error isn't cached against the idempotency key.
        // Surface a retryable message — clicking Place order again
        // generates a fresh key.
        setError('We could not place your order just now. Please try again in a moment.');
      }
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
      <DialogContent className="flex max-h-[calc(100svh-2rem)] flex-col sm:max-w-md">
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>Order this piece</DialogTitle>
            <DialogDescription>
              {props.productTitle} from {props.shopName} · {props.formattedPrice}
            </DialogDescription>
          </DialogHeader>

          {/* Body scrolls; header and footer stay put so Place order is
              always reachable on a small screen. */}
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto py-4">
            <OrderSteps shopName={props.shopName} />

            <SellerTrustBlock trust={props.sellerTrust} shopName={props.shopName} />

            <div className="bg-secondary/50 rounded-md p-3 text-sm">
              <p className="text-foreground font-medium">You are not locked in</p>
              <p className="text-muted-foreground mt-1">
                Nothing happens until {props.shopName} accepts. If you cannot agree on payment, they
                decline and you are back where you started. If an accepted order goes wrong, you can
                open a dispute and Balikha support reviews it.
              </p>
            </div>

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
                placeholder="Anything the seller should know: special handling, a delivery preference, a question."
                maxLength={2000}
                rows={3}
              />
            </div>

            <label className="flex cursor-pointer gap-3 text-sm">
              <input
                type="checkbox"
                checked={understood}
                onChange={(e) => setUnderstood(e.target.checked)}
                className="mt-0.5 size-4 shrink-0"
              />
              <span>I understand I&rsquo;ll arrange payment with {props.shopName} directly.</span>
            </label>

            {error && (
              <p className="text-destructive bg-destructive/10 rounded-md p-2 text-sm" role="alert">
                {error}
              </p>
            )}
          </div>

          <DialogFooter className="shrink-0">
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
