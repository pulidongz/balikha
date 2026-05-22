import type { ReactNode } from 'react';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { messageThreads } from '@/db/schema';
import {
  getThreadForViewer,
  getThreadForAdmin,
  getMessagesForThread,
} from '@/lib/queries/messaging';
import { writeStateFor } from '@/lib/messaging/access';
import { ThreadView } from '@/components/account/thread-view';
import { MarkThreadReadOnMount } from '@/components/account/mark-thread-read-on-mount';

// No `viewerRole` prop: on the participant path the role is derived
// from getThreadForViewer; on the adminReadOnly path the render is
// read-only so role only tints label text. A prop that is ignored on
// one path and arbitrary on the other is a maintenance trap, so it is
// not exposed (round-2 review Issue 8).
export async function EmbeddedThread({
  orderId,
  viewerUserId,
  adminReadOnly = false,
}: {
  orderId: string;
  viewerUserId: string;
  // Set by the admin order page (§8.5): forces read-only and skips
  // markThreadRead — the admin is not a recipient, so there is no
  // notification to clear.
  adminReadOnly?: boolean;
}) {
  const [threadAnchor] = await db
    .select({ id: messageThreads.id })
    .from(messageThreads)
    .where(eq(messageThreads.orderId, orderId))
    .limit(1);
  if (!threadAnchor) return null;

  const wrap = (child: ReactNode) => (
    <section className="border-t pt-6">
      <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
        Conversation
      </h2>
      <div className="mt-3">{child}</div>
    </section>
  );

  if (adminReadOnly) {
    const data = await getThreadForAdmin(threadAnchor.id);
    if (!data) return null;
    const messages = await getMessagesForThread(threadAnchor.id);
    return wrap(
      // readOnly suppresses the composer, the Report affordance, and
      // the Order CTA; viewerRole then only tints label/link text, so
      // a fixed literal is correct for the admin read-only render.
      <ThreadView
        thread={data.thread}
        messages={messages}
        viewerRole="buyer"
        writeState={writeStateFor(data.thread, data.orderStatus)}
        orderStatus={data.orderStatus}
        orderReference={data.orderReference}
        readOnly
      />,
    );
  }

  // Participant path. The order detail page that renders this has
  // already authorized the viewer against the order, so they are a
  // thread participant — getThreadForViewer resolves their role.
  const data = await getThreadForViewer(threadAnchor.id, viewerUserId);
  if (!data) return null;
  const messages = await getMessagesForThread(threadAnchor.id);

  return wrap(
    <>
      {/* Side-effect client component: clears this thread's unread
          notification on mount via a server action (Next 16 forbids
          revalidatePath during server render). */}
      <MarkThreadReadOnMount threadId={threadAnchor.id} />
      <ThreadView
        thread={data.thread}
        messages={messages}
        viewerRole={data.role}
        writeState={writeStateFor(data.thread, data.orderStatus)}
        orderStatus={data.orderStatus}
        orderReference={data.orderReference}
      />
    </>,
  );
}
