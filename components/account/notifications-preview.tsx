import { NotificationItem } from './notification-item';
import { SectionHeader } from './section-header';
import type { NotificationPreviewItem } from '@/lib/queries/account';

// 3 most-recent notifications, preferring unread (the query itself
// handles the ordering — see lib/queries/account.ts:getNotificationsPreview).
//
// Uses the existing <NotificationItem variant="preview"/> for compact
// rendering — that component owns the optimistic mark-read behavior, so
// click-to-mark-read works the same as on the full /account/notifications
// page.
export function NotificationsPreview({ items }: { items: NotificationPreviewItem[] }) {
  return (
    <section>
      <SectionHeader
        title="Recent activity"
        viewAllHref="/account/notifications"
        showViewAll={items.length > 0}
      />
      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">No recent activity.</p>
      ) : (
        <ul className="space-y-1">
          {items.map((n) => (
            <NotificationItem key={n.id} notification={n} variant="preview" />
          ))}
        </ul>
      )}
    </section>
  );
}
