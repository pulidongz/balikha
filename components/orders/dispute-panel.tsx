import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { orderDisputes } from '@/db/schema';
import { RespondToDisputeButton } from '@/components/orders/dispute-buttons';

// Surfaces the active dispute's statements on the order detail page —
// both buyer and seller see this when the order is `disputed`. Per the
// plan: dispute details are NOT publicly visible (only the parties +
// admin see this).
//
// `viewerRole` controls the "respond / update" affordance — the
// non-filer sees a primary button; the filer sees a soft "edit your
// statement" option. Both can submit a new statement; the action takes
// the most recent value.
export async function DisputePanel({
  orderId,
  viewerRole,
}: {
  orderId: string;
  viewerRole: 'buyer' | 'seller';
}) {
  // Most recent active dispute. Phase 1's partial unique index ensures
  // at most one row matches; ORDER BY is defensive in case the schema
  // ever relaxes.
  const [dispute] = await db
    .select({
      id: orderDisputes.id,
      status: orderDisputes.status,
      filedByRole: orderDisputes.filedByRole,
      reason: orderDisputes.reason,
      buyerStatement: orderDisputes.buyerStatement,
      sellerStatement: orderDisputes.sellerStatement,
      filedAt: orderDisputes.filedAt,
    })
    .from(orderDisputes)
    .where(
      and(
        eq(orderDisputes.orderId, orderId),
        inArray(orderDisputes.status, ['open', 'under_review']),
      ),
    )
    .orderBy(desc(orderDisputes.filedAt))
    .limit(1);

  if (!dispute) return null;

  const viewerStatement = viewerRole === 'buyer' ? dispute.buyerStatement : dispute.sellerStatement;
  const counterpartyStatement =
    viewerRole === 'buyer' ? dispute.sellerStatement : dispute.buyerStatement;
  const counterpartyLabel = viewerRole === 'buyer' ? 'Artist' : 'Buyer';

  return (
    <section className="border-destructive/30 bg-destructive/5 space-y-4 rounded-md border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium tracking-wide uppercase">Dispute filed</h2>
          <p className="text-muted-foreground text-xs">
            Status: {dispute.status === 'open' ? 'Awaiting admin review' : 'Under review'} · Filed
            by {dispute.filedByRole}
          </p>
        </div>
        <RespondToDisputeButton
          orderId={orderId}
          hasResponse={!!viewerStatement}
          responderLabel={viewerRole}
        />
      </div>

      <div className="space-y-3">
        <Statement
          label={`Your statement (${viewerRole})`}
          body={viewerStatement}
          fallback="You haven't added a statement yet."
        />
        <Statement
          label={`${counterpartyLabel}'s statement`}
          body={counterpartyStatement}
          fallback={`The ${counterpartyLabel.toLowerCase()} hasn't responded yet.`}
        />
      </div>
    </section>
  );
}

function Statement({
  label,
  body,
  fallback,
}: {
  label: string;
  body: string | null;
  fallback: string;
}) {
  return (
    <div>
      <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</p>
      <p className="mt-1 text-sm whitespace-pre-line">{body ?? fallback}</p>
    </div>
  );
}
