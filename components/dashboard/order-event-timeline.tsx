import { formatRelativeTime } from '@/lib/format';

interface TimelineEvent {
  id: string;
  type:
    | 'placed'
    | 'accepted'
    | 'declined'
    | 'payment_received'
    | 'shipped'
    | 'completed'
    | 'cancelled_by_buyer'
    | 'cancelled_by_seller'
    | 'auto_cancelled'
    | 'disputed'
    | 'dispute_resolved'
    | 'admin_intervention';
  actorRole: string;
  notes: string | null;
  createdAt: Date;
}

const LABEL: Record<TimelineEvent['type'], string> = {
  placed: 'Order placed',
  accepted: 'Order accepted',
  declined: 'Order declined',
  payment_received: 'Payment received',
  shipped: 'Marked as shipped',
  completed: 'Marked as received',
  cancelled_by_buyer: 'Cancelled by buyer',
  cancelled_by_seller: 'Cancelled by seller',
  auto_cancelled: 'Auto-cancelled (timeout)',
  disputed: 'Dispute filed',
  dispute_resolved: 'Dispute resolved',
  admin_intervention: 'Admin intervention',
};

// "by you" is keyed to the viewer's role so the same timeline reads
// correctly from both surfaces — a buyer sees "by you" for their own
// actions; a seller sees "by you" for theirs.
function actorLabel(role: string, viewerRole: 'buyer' | 'seller'): string {
  if (role === viewerRole) return 'by you';
  switch (role) {
    case 'buyer':
      return 'by buyer';
    case 'seller':
      return 'by seller';
    case 'admin':
      return 'by Balikha support';
    case 'system':
      return 'automatically';
    default:
      return '';
  }
}

export function OrderEventTimeline({
  events,
  viewerRole,
}: {
  events: readonly TimelineEvent[];
  viewerRole: 'buyer' | 'seller';
}) {
  if (events.length === 0) {
    return null;
  }
  return (
    <ol className="space-y-3">
      {events.map((e) => (
        <li key={e.id} className="bg-card flex gap-3 rounded-md border p-3">
          <span
            className="bg-foreground/10 mt-1 h-2 w-2 shrink-0 rounded-full"
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="text-sm">
              <span className="font-medium">{LABEL[e.type]}</span>{' '}
              <span className="text-muted-foreground">{actorLabel(e.actorRole, viewerRole)}</span>
            </p>
            <p className="text-muted-foreground text-xs">{formatRelativeTime(e.createdAt)}</p>
            {e.notes && (
              <p className="text-foreground/80 mt-1 text-sm whitespace-pre-line">{e.notes}</p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
