'use server';

import { z } from 'zod';
import { and, count, eq, gte, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { feedback } from '@/db/schema';
import { assertVerifiedEmail, tryRequireAdmin, tryRequireUser } from '@/lib/auth-helpers';
import { ok, err, type Result } from '@/lib/result';
import { getRequestLogger } from '@/lib/logger-context';

// Abuse guards mirror the comment limits: a burst cap catches rapid-fire
// spam, a daily cap bounds total volume. Tune in code if needed.
const FEEDBACK_PER_MINUTE = 3;
const FEEDBACK_PER_DAY = 20;

const submitSchema = z.object({
  category: z.enum(['bug', 'idea', 'confusing', 'other']),
  message: z.string().trim().min(1, 'Say something first.').max(2000),
  // Same-origin pathname only: the dialog supplies usePathname(), but the action
  // accepts unknown input, so a crafted call could otherwise store an absolute URL
  // and frame feedback as coming from a privileged path in the admin queue.
  route: z
    .string()
    .max(512)
    .regex(/^\/[^\s]*$/, 'route must be a same-origin path')
    .optional(),
});

async function countRecentFeedback(userId: string, since: Date): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(feedback)
    .where(and(eq(feedback.userId, userId), gte(feedback.createdAt, since)));
  return row?.value ?? 0;
}

export async function submitFeedbackAction(input: unknown): Promise<Result<{ submitted: true }>> {
  const log = await getRequestLogger();

  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message ?? 'Invalid input';
    return err(firstError);
  }

  // tryRequireUser (not getCurrentUser) so a banned user with a still-live
  // session can't reach the admin feedback queue — inherits requireUser's ban check.
  const current = await tryRequireUser();
  if (!current) return err('You must be signed in.');

  const verified = assertVerifiedEmail(current);
  if (!verified.ok) return err(verified.error);

  const burst = await countRecentFeedback(current.id, new Date(Date.now() - 60 * 1000));
  if (burst >= FEEDBACK_PER_MINUTE) {
    log.warn({ userId: current.id }, 'Feedback rate limit hit (burst)');
    return err('You are sending feedback quickly — give it a moment.');
  }
  const daily = await countRecentFeedback(current.id, new Date(Date.now() - 24 * 60 * 60 * 1000));
  if (daily >= FEEDBACK_PER_DAY) {
    log.warn({ userId: current.id }, 'Feedback rate limit hit (daily)');
    return err('Daily feedback limit reached. Come back tomorrow.');
  }

  const { category, message, route } = parsed.data;
  const [inserted] = await db
    .insert(feedback)
    // `route` is string | undefined; Drizzle omits undefined for the nullable
    // column. No `?? null` needed — avoids the rule-adjacent fallback construct.
    .values({ userId: current.id, category, message, route })
    .returning({ id: feedback.id });
  if (!inserted) return err('Could not send your feedback. Please try again.');

  log.info({ userId: current.id, feedbackId: inserted.id, category }, 'Feedback submitted');
  return ok({ submitted: true });
}

export async function resolveFeedbackAction(input: unknown): Promise<Result<{ resolved: true }>> {
  const log = await getRequestLogger();

  const parsed = z.object({ feedbackId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return err('Invalid input');

  const admin = await tryRequireAdmin();
  if (!admin) return err('Admin required.');

  const [updated] = await db
    .update(feedback)
    .set({ resolvedAt: new Date() })
    .where(and(eq(feedback.id, parsed.data.feedbackId), isNull(feedback.resolvedAt)))
    .returning({ id: feedback.id });
  if (!updated) return err('Feedback not found or already resolved.');

  log.info({ adminUserId: admin.id, feedbackId: updated.id }, 'Feedback resolved');
  return ok({ resolved: true });
}
