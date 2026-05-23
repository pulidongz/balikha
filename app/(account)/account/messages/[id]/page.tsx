import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth-helpers';
import { getThreadForViewer, getMessagesForThread } from '@/lib/queries/messaging';
import { getBlockState, writeStateFor } from '@/lib/messaging/access';
import { ThreadView } from '@/components/account/thread-view';
import { MarkThreadReadOnMount } from '@/components/account/mark-thread-read-on-mount';
import { BlockSellerButton } from '@/components/account/block-seller-button';

export const metadata = { title: 'Conversation' };

export default async function BuyerThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const current = await getCurrentUser();
  if (!current) redirect(`/sign-in?next=/account/messages/${id}`);

  // One joined query — loads the thread AND authorizes. Returns null
  // for a non-participant or a missing thread → notFound().
  const data = await getThreadForViewer(id, current.id);
  if (!data || data.role !== 'buyer') notFound();

  const messages = await getMessagesForThread(id);

  // Both block directions — drives the header's Block/Unblock toggle
  // AND the composer's paused-conversation panel. Only meaningful on
  // pre-purchase threads (blocks don't affect order-anchored threads),
  // so we skip the reads when an order is attached.
  let blockedByMe = false;
  let blockedByThem = false;
  if (!data.thread.orderId) {
    const state = await getBlockState(current.id, data.thread.artisanProfileId);
    blockedByMe = state.buyerBlockedSeller;
    blockedByThem = state.sellerBlockedBuyer;
  }

  // No DB read — writeStateFor derives from the already-loaded status.
  const writeState = writeStateFor(data.thread, data.orderStatus);

  return (
    <>
      {/* Side-effect client component: clears this thread's unread
          notification on mount via a server action (Next 16 forbids
          revalidatePath during server render). */}
      <MarkThreadReadOnMount threadId={id} />
      <ThreadView
        thread={data.thread}
        messages={messages}
        viewerRole="buyer"
        writeState={writeState}
        orderStatus={data.orderStatus}
        orderReference={data.orderReference}
        blockedByMe={blockedByMe}
        blockedByThem={blockedByThem}
        headerExtra={
          <BlockSellerButton
            artisanProfileId={data.thread.artisanProfileId}
            shopName={data.thread.artisanShopNameSnapshot}
            alreadyBlocked={blockedByMe}
          />
        }
      />
    </>
  );
}
