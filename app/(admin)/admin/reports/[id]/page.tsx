import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { messageReports, messages } from '@/db/schema';
import { requireAdmin } from '@/lib/auth-helpers';
import { getThreadForAdmin, getMessagesForThread } from '@/lib/queries/messaging';
import { writeStateFor } from '@/lib/messaging/access';
import { ThreadView } from '@/components/account/thread-view';
import { AdminReportActions } from '@/components/admin/admin-report-actions';

export const metadata = { title: 'Report — Admin' };

export default async function AdminReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const [report] = await db.select().from(messageReports).where(eq(messageReports.id, id)).limit(1);
  if (!report) notFound();

  const [reportedMessage] = await db
    .select({ threadId: messages.threadId })
    .from(messages)
    .where(eq(messages.id, report.messageId))
    .limit(1);
  if (!reportedMessage) notFound();

  const data = await getThreadForAdmin(reportedMessage.threadId);
  if (!data) notFound();
  const threadMessages = await getMessagesForThread(reportedMessage.threadId);

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-10 sm:px-6">
      <header className="space-y-2">
        <h1 className="text-xl font-medium">Reported message</h1>
        <AdminReportActions reportId={report.id} status={report.status} />
      </header>
      <aside className="border-border bg-secondary/40 text-muted-foreground rounded-md border p-3 text-sm">
        You are viewing the full conversation because a message in it was reported. Both
        participants were told a reviewer would see the surrounding context.
      </aside>
      {/* viewerRole is a benign placeholder for the read-only render —
          readOnly suppresses the composer, the Report affordance, and
          the Order CTA; viewerRole only affects label/link text. */}
      <ThreadView
        thread={data.thread}
        messages={threadMessages}
        viewerRole="buyer"
        writeState={writeStateFor(data.thread, data.orderStatus)}
        orderStatus={data.orderStatus}
        orderReference={data.orderReference}
        readOnly
      />
    </div>
  );
}
