// Weekly artist digest (T10).
//
// For every artisan studio, counts the last 7 days of traction — new
// followers, appreciations, comments (excluding the artist's own), and
// new message threads — and emails a summary to the owner.
//
// Suppression rules, in order:
//   1. Zero activity across all four counts → no send. Never email
//      "you got nothing this week".
//   2. Owner opted out (email_digest_opt_outs row) → no send.
//
// Run via: `npm run digest:weekly` (cron: weekly, e.g. Monday 08:00 PHT).
// Pass `--dry-run` to print decisions without sending.
// Pass `--now=2026-06-01T00:00:00Z` to override the window end for testing.

import 'dotenv/config';
import { createElement } from 'react';
import { and, count, eq, gte, ne } from 'drizzle-orm';
import { db } from '@/db';
import { logger } from '@/lib/logger';
import {
  appreciations,
  artisanFollows,
  artisanProfiles,
  emailDigestOptOuts,
  messageThreads,
  products,
  user,
  workComments,
} from '@/db/schema';
import { env } from '@/env';
import { sendEmail } from '@/lib/email/send';
import { digestUnsubscribeToken } from '@/lib/email/digest-unsubscribe';
import {
  WeeklyDigestEmail,
  type WeeklyDigestCounts,
} from '@/lib/email/templates/weekly-digest-email';
import { studioPath } from '@/lib/routes';

const DRY_RUN = process.argv.includes('--dry-run');
const nowArg = process.argv.find((a) => a.startsWith('--now='));
const NOW = nowArg ? new Date(nowArg.slice('--now='.length)) : new Date();
if (Number.isNaN(NOW.getTime())) throw new Error(`Invalid --now value: ${nowArg}`);
const CUTOFF = new Date(NOW.getTime() - 7 * 24 * 60 * 60 * 1000);

async function countsForArtisan(artisanProfileId: string): Promise<WeeklyDigestCounts> {
  const [followersRow] = await db
    .select({ value: count() })
    .from(artisanFollows)
    .where(
      and(
        eq(artisanFollows.artisanProfileId, artisanProfileId),
        gte(artisanFollows.createdAt, CUTOFF),
      ),
    );

  const [appreciationsRow] = await db
    .select({ value: count() })
    .from(appreciations)
    .innerJoin(products, eq(products.id, appreciations.productId))
    .where(
      and(eq(products.artisanProfileId, artisanProfileId), gte(appreciations.createdAt, CUTOFF)),
    );

  return {
    newFollowers: followersRow?.value ?? 0,
    appreciations: appreciationsRow?.value ?? 0,
    comments: 0, // filled below — needs the owner's user id to exclude self-comments
    newMessageThreads: 0,
  };
}

async function main() {
  const studios = await db
    .select({
      artisanProfileId: artisanProfiles.id,
      shopName: artisanProfiles.shopName,
      shopSlug: artisanProfiles.shopSlug,
      ownerUserId: artisanProfiles.userId,
      ownerEmail: user.email,
    })
    .from(artisanProfiles)
    .innerJoin(user, eq(user.id, artisanProfiles.userId));

  let sent = 0;
  let skippedEmpty = 0;
  let skippedOptOut = 0;

  for (const studio of studios) {
    const counts = await countsForArtisan(studio.artisanProfileId);

    const [commentsRow] = await db
      .select({ value: count() })
      .from(workComments)
      .innerJoin(products, eq(products.id, workComments.productId))
      .where(
        and(
          eq(products.artisanProfileId, studio.artisanProfileId),
          gte(workComments.createdAt, CUTOFF),
          ne(workComments.userId, studio.ownerUserId),
        ),
      );
    counts.comments = commentsRow?.value ?? 0;

    const [threadsRow] = await db
      .select({ value: count() })
      .from(messageThreads)
      .where(
        and(
          eq(messageThreads.artisanProfileId, studio.artisanProfileId),
          gte(messageThreads.createdAt, CUTOFF),
        ),
      );
    counts.newMessageThreads = threadsRow?.value ?? 0;

    const total =
      counts.newFollowers + counts.appreciations + counts.comments + counts.newMessageThreads;
    if (total === 0) {
      skippedEmpty++;
      if (DRY_RUN) logger.info({ studio: studio.shopSlug }, 'digest: skip (empty)');
      continue;
    }

    const [optOut] = await db
      .select({ userId: emailDigestOptOuts.userId })
      .from(emailDigestOptOuts)
      .where(eq(emailDigestOptOuts.userId, studio.ownerUserId))
      .limit(1);
    if (optOut) {
      skippedOptOut++;
      if (DRY_RUN) logger.info({ studio: studio.shopSlug, counts }, 'digest: skip (opt-out)');
      continue;
    }

    const token = digestUnsubscribeToken(studio.ownerUserId);
    const unsubscribeUrl = `${env.NEXT_PUBLIC_APP_URL}/api/email/digest-unsubscribe?uid=${encodeURIComponent(studio.ownerUserId)}&token=${token}`;

    if (DRY_RUN) {
      logger.info({ studio: studio.shopSlug, counts }, 'digest: would send');
      sent++;
      continue;
    }

    const result = await sendEmail({
      to: studio.ownerEmail,
      subject: `Your week at ${studio.shopName} — Balikha`,
      react: createElement(WeeklyDigestEmail, {
        shopName: studio.shopName,
        counts,
        studioUrl: `${env.NEXT_PUBLIC_APP_URL}${studioPath(studio.shopSlug)}`,
        unsubscribeUrl,
      }),
    });
    if (!result.ok) {
      logger.error({ studio: studio.shopSlug, errMessage: result.error }, 'digest: send failed');
      continue;
    }
    sent++;
    logger.info({ studio: studio.shopSlug, counts }, 'digest: sent');
  }

  logger.info(
    { sent, skippedEmpty, skippedOptOut, dryRun: DRY_RUN, windowStart: CUTOFF.toISOString() },
    'digest: done',
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    logger.error({ err: e }, 'digest: failed');
    process.exit(1);
  });
