'use server';

import { z } from 'zod';
import { and, count, eq, gte, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { artisanProfiles, commentReports, products, workComments } from '@/db/schema';
import { getCurrentUser, tryRequireAdmin } from '@/lib/auth-helpers';
import { ok, err, type Result } from '@/lib/result';
import { getRequestLogger } from '@/lib/logger-context';
import { COMMENT_MAX_LENGTH } from '@/lib/comments/constants';
import { emitDedupedNotification } from '@/lib/notifications/emit';
import { workPath } from '@/lib/routes';

// Abuse guards (T8). Burst limit catches rapid-fire spam; the daily cap
// bounds total volume. Tune in code if observed in production — same
// philosophy as the messaging limits, just without the env knobs until
// someone actually needs to turn them.
const COMMENTS_PER_MINUTE = 4;
const COMMENTS_PER_DAY = 100;

const postSchema = z.object({
  productId: z.string().uuid(),
  body: z.string().trim().min(1, 'Say something first.').max(COMMENT_MAX_LENGTH),
});

async function countRecentComments(userId: string, since: Date): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(workComments)
    .where(and(eq(workComments.userId, userId), gte(workComments.createdAt, since)));
  return row?.value ?? 0;
}

export async function postWorkCommentAction(
  input: unknown,
): Promise<Result<{ id: string; createdAt: string }>> {
  const log = await getRequestLogger();

  const parsed = postSchema.safeParse(input);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message ?? 'Invalid input';
    return err(firstError);
  }

  const current = await getCurrentUser();
  if (!current) return err('You must be signed in.');

  const { productId, body } = parsed.data;

  // Comments only land on published works. Owner + slugs come along for
  // the notification below.
  const [work] = await db
    .select({
      id: products.id,
      title: products.title,
      slug: products.slug,
      ownerUserId: artisanProfiles.userId,
      shopSlug: artisanProfiles.shopSlug,
    })
    .from(products)
    .innerJoin(artisanProfiles, eq(artisanProfiles.id, products.artisanProfileId))
    .where(and(eq(products.id, productId), eq(products.status, 'published')))
    .limit(1);
  if (!work) return err('That work could not be found.');

  const burst = await countRecentComments(current.id, new Date(Date.now() - 60 * 1000));
  if (burst >= COMMENTS_PER_MINUTE) {
    return err('You are commenting quickly — give it a moment.');
  }
  const daily = await countRecentComments(current.id, new Date(Date.now() - 24 * 60 * 60 * 1000));
  if (daily >= COMMENTS_PER_DAY) {
    return err('Daily comment limit reached. Come back tomorrow.');
  }

  const [inserted] = await db
    .insert(workComments)
    .values({ productId, userId: current.id, body })
    .returning({ id: workComments.id, createdAt: workComments.createdAt });
  if (!inserted) return err('Could not post your comment. Please try again.');

  log.info({ userId: current.id, productId, commentId: inserted.id }, 'Comment posted');

  // T10: tell the artist — unless they commented on their own work.
  // Comments are public with names, so the notification names the author.
  // Deduped on unread per work: a burst of comments reads as one row.
  if (work.ownerUserId !== current.id) {
    await emitDedupedNotification({
      userId: work.ownerUserId,
      type: 'work_commented',
      title: `${current.name} commented on “${work.title}”`,
      body: body.slice(0, 120),
      target: { kind: 'product', id: productId, url: workPath(work.shopSlug, work.slug) },
    });
  }

  return ok({ id: inserted.id, createdAt: inserted.createdAt.toISOString() });
}

export async function deleteWorkCommentAction(input: unknown): Promise<Result<{ deleted: true }>> {
  const log = await getRequestLogger();

  const parsed = z.object({ commentId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return err('Invalid input');

  const current = await getCurrentUser();
  if (!current) return err('You must be signed in.');

  // Author may delete their own comment; the work's artist may delete any
  // comment on their own work (T8).
  const [row] = await db
    .select({ authorUserId: workComments.userId, ownerUserId: artisanProfiles.userId })
    .from(workComments)
    .innerJoin(products, eq(products.id, workComments.productId))
    .innerJoin(artisanProfiles, eq(artisanProfiles.id, products.artisanProfileId))
    .where(eq(workComments.id, parsed.data.commentId))
    .limit(1);
  if (!row) return err('Comment not found.');
  if (row.authorUserId !== current.id && row.ownerUserId !== current.id) {
    return err('You can only delete your own comments, or comments on your own work.');
  }

  await db.delete(workComments).where(eq(workComments.id, parsed.data.commentId));
  log.info({ userId: current.id, commentId: parsed.data.commentId }, 'Comment deleted');
  return ok({ deleted: true });
}

export async function reportWorkCommentAction(input: unknown): Promise<Result<{ reported: true }>> {
  const log = await getRequestLogger();

  const parsed = z.object({ commentId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return err('Invalid input');

  const current = await getCurrentUser();
  if (!current) return err('You must be signed in.');

  const [comment] = await db
    .select({
      id: workComments.id,
      productId: workComments.productId,
      authorUserId: workComments.userId,
      body: workComments.body,
    })
    .from(workComments)
    .where(eq(workComments.id, parsed.data.commentId))
    .limit(1);
  if (!comment) return err('Comment not found.');
  if (comment.authorUserId === current.id) return err('You cannot report your own comment.');

  // Unique (commentId, reporterUserId): a second report from the same
  // person is a no-op, and we still tell them it worked — "already
  // reported" is the same outcome from their side.
  await db
    .insert(commentReports)
    .values({
      commentId: comment.id,
      productId: comment.productId,
      reporterUserId: current.id,
      reportedUserId: comment.authorUserId,
      commentBody: comment.body,
    })
    .onConflictDoNothing();

  log.info({ reporterUserId: current.id, commentId: comment.id }, 'Comment reported');
  return ok({ reported: true });
}

export async function resolveCommentReportAction(
  input: unknown,
): Promise<Result<{ resolved: true }>> {
  const log = await getRequestLogger();

  const parsed = z.object({ reportId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return err('Invalid input');

  const admin = await tryRequireAdmin();
  if (!admin) return err('Admin required.');

  const [updated] = await db
    .update(commentReports)
    .set({ resolvedAt: new Date() })
    .where(and(eq(commentReports.id, parsed.data.reportId), isNull(commentReports.resolvedAt)))
    .returning({ id: commentReports.id });
  if (!updated) return err('Report not found or already resolved.');

  log.info({ adminUserId: admin.id, reportId: updated.id }, 'Comment report resolved');
  return ok({ resolved: true });
}
