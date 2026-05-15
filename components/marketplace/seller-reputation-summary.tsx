import { bucketLabel, type SellerReputation } from '@/lib/queries/seller-reputation';
import { cn } from '@/lib/utils';

// Inline summary line(s) for an artisan's reputation. Renders nothing
// when there are no orders in the window yet — new sellers shouldn't
// look "0% fulfilled" by default. Conditional rendering on each metric
// keeps the line honest: no response time when none has been recorded,
// no dispute rate below the 5% threshold (avoids the "0% disputed"
// vanity badge everyone would get for free).
//
// `responseRate < 1` triggers the longer "Responds to N% of orders,
// typically within X" framing — flattering a seller who ignores most
// of their inbox is a buyer-protection failure (Issue 13).
export function SellerReputationSummary({
  reputation,
  className,
}: {
  reputation: SellerReputation;
  className?: string;
}) {
  if (reputation.totalOrdersInWindow === 0) return null;

  const parts: string[] = [];

  if (reputation.responseTimeBucket) {
    if (reputation.responseRate < 1) {
      parts.push(
        `Responds to ${Math.round(reputation.responseRate * 100)}% of orders, typically within ${bucketLabel(reputation.responseTimeBucket)}`,
      );
    } else {
      parts.push(`Typically responds within ${bucketLabel(reputation.responseTimeBucket)}`);
    }
  }

  if (reputation.fulfillmentRate !== null) {
    parts.push(`${Math.round(reputation.fulfillmentRate * 100)}% fulfilled`);
  }

  const showDispute = reputation.disputeRate > 0.05;

  if (parts.length === 0 && !showDispute) return null;

  return (
    <div
      className={cn(
        'text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs',
        className,
      )}
    >
      {parts.map((p, i) => (
        <span key={i}>{p}</span>
      ))}
      {showDispute && (
        <span className="text-destructive">
          {Math.round(reputation.disputeRate * 100)}% disputed
        </span>
      )}
    </div>
  );
}
