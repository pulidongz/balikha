import { redirect } from 'next/navigation';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { notifications } from '@/db/schema';
import { getCurrentUser } from '@/lib/auth-helpers';
import { notNewMessage } from '@/lib/queries/account';
import { NotificationItem } from '@/components/account/notification-item';
import { MarkAllReadButton } from '@/components/account/mark-all-read-button';

export const metadata = {
  title: 'Notifications',
};

const PAGE_SIZE = 50;

export default async function NotificationsPage() {
  const current = await getCurrentUser();
  if (!current) redirect('/sign-in?next=/account/notifications');

  // Exclude message notifications — the Messages page owns them and
  // clearing them happens per-thread via markThreadRead.
  const items = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, current.id), notNewMessage))
    .orderBy(desc(notifications.createdAt))
    .limit(PAGE_SIZE);

  const unreadCount = items.filter((n) => n.readAt === null).length;

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl">Notifications</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {items.length === 0
              ? 'Nothing here yet.'
              : unreadCount > 0
                ? `${unreadCount} unread`
                : 'All caught up.'}
          </p>
        </div>
        {unreadCount > 0 && <MarkAllReadButton />}
      </header>

      {items.length === 0 ? (
        <div className="bg-card rounded-md border p-8 text-center">
          <p className="text-muted-foreground text-sm">
            Notifications about new listings from artisans you follow will appear here.
          </p>
        </div>
      ) : (
        <ul className="-ml-4 space-y-1">
          {items.map((n) => (
            <NotificationItem key={n.id} notification={n} />
          ))}
        </ul>
      )}
    </div>
  );
}
