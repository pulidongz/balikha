import { notFound } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { sellerBlockedBuyers } from '@/db/schema';
import { requireSellerProfile } from '@/lib/auth-helpers';
import { getThreadForViewer, getMessagesForThread } from '@/lib/queries/messaging';
import { writeStateFor } from '@/lib/messaging/access';
import { ThreadView } from '@/components/account/thread-view';
import { MarkThreadReadOnMount } from '@/components/account/mark-thread-read-on-mount';
import { BlockBuyerButton } from '@/components/dashboard/block-buyer-button';

export const metadata = { title: 'Conversation — Dashboard' };

export default async function SellerThreadPage({ params }: { params: Promise<{ id: string }> }) {
  // requireSellerProfile() returns the full artisan_profiles row,
  // including userId — no separate getCurrentUser() call needed.
  const profile = await requireSellerProfile();
  const { id } = await params;

  // One joined query — loads + authorizes. Returns null for a
  // non-participant; the role guard rejects a buyer-only viewer.
  const data = await getThreadForViewer(id, profile.userId);
  if (!data || data.role !== 'seller') notFound();

  const messages = await getMessagesForThread(id);

  // Block status drives the header's Block/Unblock affordance.
  const [block] = await db
    .select({ blockedUserId: sellerBlockedBuyers.blockedUserId })
    .from(sellerBlockedBuyers)
    .where(
      and(
        eq(sellerBlockedBuyers.artisanProfileId, profile.id),
        eq(sellerBlockedBuyers.blockedUserId, data.thread.buyerUserId),
      ),
    )
    .limit(1);

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10 sm:px-6">
      {/* Side-effect client component (see Next 16 note in
          mark-thread-read-on-mount.tsx). */}
      <MarkThreadReadOnMount threadId={id} />
      <ThreadView
        thread={data.thread}
        messages={messages}
        viewerRole="seller"
        writeState={writeStateFor(data.thread, data.orderStatus)}
        orderStatus={data.orderStatus}
        orderReference={data.orderReference}
        headerExtra={
          <BlockBuyerButton buyerUserId={data.thread.buyerUserId} alreadyBlocked={!!block} />
        }
      />
    </div>
  );
}
