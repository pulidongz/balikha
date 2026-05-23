import { notFound } from 'next/navigation';
import { requireSellerProfile } from '@/lib/auth-helpers';
import { getThreadForViewer, getMessagesForThread } from '@/lib/queries/messaging';
import { getBlockState, writeStateFor } from '@/lib/messaging/access';
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

  // Both block directions — mirrors the buyer thread page. Skipped on
  // order-anchored threads where blocks don't apply.
  let blockedByMe = false;
  let blockedByThem = false;
  if (!data.thread.orderId) {
    const state = await getBlockState(data.thread.buyerUserId, data.thread.artisanProfileId);
    blockedByMe = state.sellerBlockedBuyer;
    blockedByThem = state.buyerBlockedSeller;
  }

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
        blockedByMe={blockedByMe}
        blockedByThem={blockedByThem}
        headerExtra={
          <BlockBuyerButton buyerUserId={data.thread.buyerUserId} alreadyBlocked={blockedByMe} />
        }
      />
    </div>
  );
}
