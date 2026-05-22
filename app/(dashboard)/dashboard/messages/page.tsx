import { requireSellerProfile } from '@/lib/auth-helpers';
import { getInboxForSeller } from '@/lib/queries/messaging';
import { MessagesInbox } from '@/components/account/messages-inbox';

export const metadata = { title: 'Messages — Dashboard' };

export default async function SellerMessagesPage() {
  // requireSellerProfile() returns the full artisan_profiles row,
  // which includes userId — so there is no separate getCurrentUser()
  // call and no unreachable `if (!current)` blank-page branch.
  const profile = await requireSellerProfile();

  const threads = await getInboxForSeller(profile.id, profile.userId);

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10 sm:px-6">
      <header className="space-y-1">
        <h1 className="text-xl font-medium">Messages</h1>
        <p className="text-muted-foreground text-sm">
          Conversations with buyers — pre-purchase and in-flight orders.
        </p>
      </header>
      <MessagesInbox threads={threads} side="seller" />
    </div>
  );
}
