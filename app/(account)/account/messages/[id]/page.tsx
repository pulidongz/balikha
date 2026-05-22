import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth-helpers';
import { getThreadForViewer, getMessagesForThread } from '@/lib/queries/messaging';
import { writeStateFor } from '@/lib/messaging/access';
import { ThreadView } from '@/components/account/thread-view';
import { MarkThreadReadOnMount } from '@/components/account/mark-thread-read-on-mount';

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
      />
    </>
  );
}
