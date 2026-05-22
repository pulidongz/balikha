import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth-helpers';
import { getInboxForBuyer } from '@/lib/queries/messaging';
import { MessagesInbox } from '@/components/account/messages-inbox';

export const metadata = { title: 'Messages' };

export default async function BuyerMessagesPage() {
  const current = await getCurrentUser();
  if (!current) redirect('/sign-in?next=/account/messages');

  const threads = await getInboxForBuyer(current.id);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-serif text-2xl tracking-tight">Messages</h1>
        <p className="text-muted-foreground text-sm">
          Conversations with makers, before and after you order.
        </p>
      </header>
      <MessagesInbox threads={threads} side="buyer" />
    </div>
  );
}
