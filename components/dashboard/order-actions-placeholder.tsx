import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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

interface ActionSpec {
  label: string;
  variant: 'default' | 'outline' | 'destructive';
}

// Phase 3 renders these as disabled placeholders so the dashboard shows
// the right affordances at the right statuses. Phase 4 swaps each label
// for a real form/server-action wiring without touching the surrounding
// detail page layout.
function actionsFor(status: Status): readonly ActionSpec[] {
  switch (status) {
    case 'pending_seller_response':
      return [
        { label: 'Accept', variant: 'default' },
        { label: 'Decline', variant: 'outline' },
      ];
    case 'pending_payment_arrangement':
      return [
        { label: 'Mark payment received', variant: 'default' },
        { label: 'Cancel order', variant: 'destructive' },
      ];
    case 'payment_received':
      return [
        { label: 'Mark shipped', variant: 'default' },
        { label: 'Cancel order', variant: 'destructive' },
      ];
    case 'shipped':
    case 'completed':
    case 'cancelled_by_buyer':
    case 'cancelled_by_seller':
    case 'auto_cancelled':
    case 'disputed':
      return [];
  }
}

export function OrderActionsPlaceholder({ status }: { status: Status }) {
  const actions = actionsFor(status);
  if (actions.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium tracking-wide uppercase">Actions</h2>
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            disabled
            aria-disabled="true"
            title="Available once seller actions ship (Phase 4)"
            className={cn(buttonVariants({ variant: a.variant }), 'cursor-not-allowed opacity-60')}
          >
            {a.label}
          </button>
        ))}
      </div>
      <p className="text-muted-foreground text-xs">
        Action buttons land in Phase 4. The buttons reflect what you&rsquo;ll be able to do at each
        status.
      </p>
    </section>
  );
}
