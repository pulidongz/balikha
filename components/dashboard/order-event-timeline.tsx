import { formatRelativeTime } from '@/lib/format';
import type { OrderEventType, OrderStatus } from '@/lib/orders/types';

interface TimelineEvent {
  id: string;
  type: OrderEventType;
  actorRole: string;
  notes: string | null;
  createdAt: Date;
}

const LABEL: Record<OrderEventType, string> = {
  placed: 'Order placed',
  accepted: 'Order accepted',
  declined: 'Order declined',
  payment_received: 'Payment received',
  shipped: 'Marked as shipped',
  completed: 'Marked as received',
  cancelled_by_buyer: 'Cancelled by buyer',
  cancelled_by_seller: 'Cancelled by artist',
  auto_cancelled: 'Auto-cancelled (timeout)',
  disputed: 'Dispute filed',
  dispute_resolved: 'Dispute resolved',
  admin_intervention: 'Admin intervention',
};

// The lifecycle's "good" milestones. Any event type NOT in this set is
// an exception (declined, cancelled, disputed, ...) and its node gets
// the attention treatment instead of the neutral one.
const HAPPY_PATH_EVENTS: ReadonlySet<OrderEventType> = new Set([
  'placed',
  'accepted',
  'payment_received',
  'shipped',
  'completed',
]);

// Off-path events that ended the order badly — these read as failure,
// so their node is filled with `destructive`. Everything else off the
// happy path (a resolved dispute, an admin stepping in) is a holding
// state and takes the `warning` (Burnt Amber) treatment instead.
const FAILED_EVENTS: ReadonlySet<OrderEventType> = new Set([
  'declined',
  'cancelled_by_buyer',
  'cancelled_by_seller',
  'auto_cancelled',
  'disputed',
]);

// Milestones that can still be AHEAD of the order. `placed` is omitted
// because an order always has it already. Labels are anticipatory:
// they read as what the order is waiting on, not as a logged event.
const UPCOMING_MILESTONES = ['accepted', 'payment_received', 'shipped', 'completed'] as const;
type UpcomingMilestone = (typeof UPCOMING_MILESTONES)[number];

const UPCOMING_LABEL: Record<UpcomingMilestone, string> = {
  accepted: 'Awaiting artist response',
  payment_received: 'Awaiting payment',
  shipped: 'Awaiting shipment',
  completed: 'Awaiting delivery',
};

// How many of UPCOMING_MILESTONES the order has already cleared, given
// its current status. `null` means the order left the happy path
// (cancelled / disputed) — no future milestones get projected.
function clearedMilestones(status: OrderStatus): number | null {
  switch (status) {
    case 'pending_seller_response':
      return 0;
    case 'pending_payment_arrangement':
      return 1;
    case 'payment_received':
      return 2;
    case 'shipped':
      return 3;
    case 'completed':
      return 4;
    case 'cancelled_by_buyer':
    case 'cancelled_by_seller':
    case 'auto_cancelled':
    case 'disputed':
      return null;
  }
}

// "by you" is keyed to the viewer's role so the same timeline reads
// correctly from every surface — a buyer sees "by you" for their own
// actions, a seller sees it for theirs.
function actorLabel(role: string, viewerRole: 'buyer' | 'seller' | 'admin'): string {
  // The viewer sees their own party's actions as "by you". An admin is
  // not a party to the order, so nothing reads as "by you" for them.
  if (viewerRole !== 'admin' && role === viewerRole) return 'by you';
  switch (role) {
    case 'buyer':
      return 'by buyer';
    case 'seller':
      return 'by artist';
    case 'admin':
      return 'by Balikha support';
    case 'system':
      return 'automatically';
    default:
      return '';
  }
}

type RailNode =
  | { kind: 'done' | 'current'; event: TimelineEvent }
  | { kind: 'upcoming'; milestone: UpcomingMilestone };

// A rail segment is solid only where it joins settled history; any
// segment touching "now" or the not-yet is dashed.
const RAIL_SOLID = 'border-border';
const RAIL_DASHED = 'border-dashed border-muted-foreground/40';

function nodeFillClass(node: RailNode): string {
  if (node.kind === 'upcoming') {
    return 'border border-dashed border-muted-foreground/50 bg-card';
  }
  const offPath = !HAPPY_PATH_EVENTS.has(node.event.type);
  // Gold is reserved for genuinely special moments and never marks a
  // failure (see DESIGN.md, the Gold-Is-Rare rule). A bad ending reads
  // as `destructive`; an unresolved off-path state reads as `warning`.
  if (!offPath) {
    return node.kind === 'current' ? 'bg-accent ring-4 ring-accent/15' : 'bg-muted-foreground';
  }
  const failed = FAILED_EVENTS.has(node.event.type);
  if (node.kind === 'current') {
    return failed
      ? 'bg-destructive ring-4 ring-destructive/15'
      : 'bg-warning ring-4 ring-warning/15';
  }
  return failed ? 'bg-destructive' : 'bg-warning';
}

/**
 * Order activity as a vertical progress rail. Logged events are
 * connected nodes on a solid rail (history already walked); the latest
 * event is emphasized as the current state; milestones still ahead
 * trail off as ghosted nodes on a dashed rail, so the reader sees both
 * where the order stands and what happens next.
 *
 * Shared by the buyer, seller, and admin order pages — `viewerRole`
 * keys the "by you" copy; `status` drives which milestones are still
 * upcoming.
 */
export function OrderEventTimeline({
  events,
  status,
  viewerRole,
}: {
  events: readonly TimelineEvent[];
  status: OrderStatus;
  viewerRole: 'buyer' | 'seller' | 'admin';
}) {
  if (events.length === 0) return null;

  // Every logged event is a node; the last one is the order's current
  // state and gets the emphasized marker.
  const eventNodes: RailNode[] = events.map((event, i) => ({
    kind: i === events.length - 1 ? 'current' : 'done',
    event,
  }));

  // Project the milestones the order hasn't reached yet — skipped once
  // the order has left the happy path.
  const cleared = clearedMilestones(status);
  const upcomingNodes: RailNode[] =
    cleared === null
      ? []
      : UPCOMING_MILESTONES.slice(cleared).map((milestone) => ({ kind: 'upcoming', milestone }));

  const nodes: RailNode[] = [...eventNodes, ...upcomingNodes];

  return (
    <ol>
      {nodes.map((node, i) => {
        const isFirst = i === 0;
        const isLast = i === nodes.length - 1;
        // Each rail segment's style is owned by the node above it.
        const prev = i > 0 ? nodes[i - 1] : undefined;
        const segmentInto = prev?.kind === 'done' ? RAIL_SOLID : RAIL_DASHED;
        const segmentOut = node.kind === 'done' ? RAIL_SOLID : RAIL_DASHED;
        const isFirstUpcoming = node.kind === 'upcoming' && i === eventNodes.length;
        const actor = node.kind === 'upcoming' ? '' : actorLabel(node.event.actorRole, viewerRole);

        return (
          <li
            key={node.kind === 'upcoming' ? node.milestone : node.event.id}
            className="flex gap-3 pb-6 last:pb-0"
          >
            {/* Rail column: two absolute segments meet at the node, so
                the line is continuous across rows and the node paints
                cleanly on top of it. */}
            <div className="relative w-3 shrink-0" aria-hidden="true">
              {!isFirst && (
                <span
                  className={`absolute top-0 left-1/2 h-2.5 w-0 -translate-x-1/2 border-l ${segmentInto}`}
                />
              )}
              {!isLast && (
                <span
                  className={`absolute top-2.5 bottom-0 left-1/2 w-0 -translate-x-1/2 border-l ${segmentOut}`}
                />
              )}
              <span
                className={`relative z-10 mt-1 block size-3 rounded-full ${nodeFillClass(node)}`}
              />
            </div>

            <div className="min-w-0 flex-1">
              {node.kind === 'upcoming' ? (
                <>
                  <p className="text-muted-foreground text-sm">{UPCOMING_LABEL[node.milestone]}</p>
                  {isFirstUpcoming && (
                    <p className="text-muted-foreground/70 mt-0.5 text-xs tracking-wide uppercase">
                      Up next
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p className="text-sm">
                    <span
                      className={
                        node.kind === 'current' ? 'text-foreground font-medium' : 'text-foreground'
                      }
                    >
                      {LABEL[node.event.type]}
                    </span>{' '}
                    {actor && <span className="text-muted-foreground">{actor}</span>}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    <time dateTime={node.event.createdAt.toISOString()}>
                      {formatRelativeTime(node.event.createdAt)}
                    </time>
                  </p>
                  {node.event.notes && (
                    <p className="text-foreground/80 mt-1.5 text-sm whitespace-pre-line">
                      {node.event.notes}
                    </p>
                  )}
                </>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
