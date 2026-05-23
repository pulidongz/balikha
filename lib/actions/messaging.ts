'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  artisanProfiles,
  buyerBlockedSellers,
  idempotencyKeys,
  messageThreads,
  messages,
  notifications,
  products,
  sellerBlockedBuyers,
} from '@/db/schema';
import { requireUser, requireArtisan } from '@/lib/auth-helpers';
import { IDEMPOTENCY_TTL_MS, withIdempotency } from '@/lib/idempotency';
import { getRequestLogger } from '@/lib/logger-context';
import { err, ok, type Result } from '@/lib/result';
import {
  assertThreadAccess,
  getWriteState,
  isBuyerBlocked,
  isSellerBlocked,
} from '@/lib/messaging/access';
import { fanOutMessageNotification } from '@/lib/messaging/fan-out';
import {
  isAtDailyMessageLimit,
  isAtNewThreadLimit,
  isAtThreadBurstLimit,
} from '@/lib/messaging/rate-limit';
import {
  blockBuyerSchema,
  blockSellerSchema,
  createPrePurchaseThreadSchema,
  markThreadReadSchema,
  sendMessageSchema,
  unblockBuyerSchema,
  unblockSellerSchema,
} from '@/lib/validators/messaging';

// User-facing rejection thrown inside withIdempotency's transaction.
// Mirrors lib/actions/orders.ts:OrderBusinessError — deterministic
// outcomes safe to cache against the idempotency key.
class MessagingBusinessError extends Error {}

/**
 * Create a pre-purchase thread + its first message. The action is
 * non-idempotent (every successful run inserts both rows), so it uses
 * the SAME three-part discipline as placeOrder:
 *   1. Advisory lock keyed on the idempotency key,
 *   2. In-lock cache re-check,
 *   3. Idempotency-row insert INSIDE the transaction.
 *
 * idempotencyKey is REQUIRED (§4.5) — there is no no-key path. The
 * partial unique index message_threads_active_pre_purchase_idx is the
 * durable backstop: if two distinct submits (each with its own key)
 * race past their separate advisory locks, the second insert hits the
 * index and the action translates the constraint error to a friendly
 * "There's already an open conversation about this piece."
 *
 * Rate limits are checked INSIDE fn(), AFTER the in-lock idempotency
 * cache re-check — never before withIdempotency. A pre-flight check
 * would be non-idempotent: a same-key retry of a call that already
 * created a thread would re-count that thread and spuriously trip the
 * limit, instead of returning the cached success.
 */
export async function createPrePurchaseThread(
  input: unknown,
): Promise<Result<{ threadId: string }>> {
  const log = await getRequestLogger();
  const parsed = createPrePurchaseThreadSchema.safeParse(input);
  if (!parsed.success) {
    return err('Invalid input', parsed.error.flatten().fieldErrors);
  }

  // Auth first — outside withIdempotency so a transient "Not
  // authenticated" isn't permanently pinned to the key.
  const buyer = await requireUser().catch(() => null);
  if (!buyer) return err('Not authenticated');

  return withIdempotency({
    key: parsed.data.idempotencyKey,
    scope: 'createPrePurchaseThread',
    userId: buyer.id,
    fn: async () => {
      try {
        type TxResult =
          | { kind: 'cached'; cached: Result<{ threadId: string }> }
          | { kind: 'fresh'; threadId: string };

        const result: TxResult = await db.transaction(async (tx) => {
          // Advisory lock keyed on the (required) idempotency key, so
          // a same-key retry serializes behind the original call.
          await tx.execute(
            sql`SELECT pg_advisory_xact_lock(hashtext(${parsed.data.idempotencyKey}))`,
          );

          // In-lock idempotency cache re-check. A same-key retry that
          // already succeeded returns the cached result HERE — before
          // the rate-limit check below — so a retry-after-success is
          // never spuriously re-gated by the limit.
          const [cached] = await tx
            .select()
            .from(idempotencyKeys)
            .where(eq(idempotencyKeys.key, parsed.data.idempotencyKey))
            .limit(1);
          if (cached) {
            if (cached.scope !== 'createPrePurchaseThread') {
              return {
                kind: 'cached' as const,
                cached: err('Idempotency key already used for a different operation.'),
              };
            }
            if (cached.userId && cached.userId !== buyer.id) {
              return {
                kind: 'cached' as const,
                cached: err('Idempotency key already used by a different user.'),
              };
            }
            return {
              kind: 'cached' as const,
              cached: JSON.parse(cached.responseJson) as Result<{ threadId: string }>,
            };
          }

          // Rate limits — checked here, AFTER the in-lock cache
          // re-check, so a retry-after-success short-circuits above and
          // is never re-gated (round-2 review Issue 6). A genuinely
          // fresh call evaluates the limits and, if tripped, throws a
          // MessagingBusinessError — a deterministic outcome for this
          // key, safe for withIdempotency to cache. The buyer's next
          // genuine attempt uses a fresh key and is re-evaluated.
          //
          // NOTE (round-3 review Issue 1): these COUNT helpers query
          // the module-level `db`, not `tx` — a separate pooled
          // connection, outside this transaction's snapshot and the
          // advisory lock's serialization. The limit is therefore
          // ADVISORY spam friction, not a concurrency-exact invariant:
          // two simultaneous first-time submits by one buyer (distinct
          // keys → distinct locks) can both pass. Accepted for v1 —
          // matches the plan's "indexed COUNT, not Redis" stance (§1).
          if (await isAtNewThreadLimit(buyer.id)) {
            log.info({ buyerUserId: buyer.id }, 'new-thread rate limit hit');
            throw new MessagingBusinessError(
              'You can only start one new conversation per day. Try again tomorrow.',
            );
          }
          if (await isAtDailyMessageLimit(buyer.id)) {
            throw new MessagingBusinessError(
              'You have reached the daily message limit. Try again tomorrow.',
            );
          }

          // Load the product + artisan for the snapshot. FOR UPDATE
          // on the product so a concurrent status change (e.g.
          // archive) doesn't slip between the read and the snapshot.
          const [product] = await tx
            .select()
            .from(products)
            .where(eq(products.id, parsed.data.productId))
            .for('update')
            .limit(1);
          if (!product) throw new MessagingBusinessError('Product not found');

          // Pre-purchase messaging is allowed on `published` and
          // `sold_out` (buyer may ask about a restock) but NOT on
          // `archived` or `draft`. Decision per ticket open question #5.
          if (product.status !== 'published' && product.status !== 'sold_out') {
            throw new MessagingBusinessError('This piece is no longer available to ask about.');
          }

          const [artisan] = await tx
            .select()
            .from(artisanProfiles)
            .where(eq(artisanProfiles.id, product.artisanProfileId))
            .limit(1);
          if (!artisan) throw new Error('Artisan profile missing');

          if (artisan.userId === buyer.id) {
            throw new MessagingBusinessError('You cannot message your own product.');
          }

          // Block check inside the lock so a block placed mid-action
          // doesn't slip through. Symmetric — either party having blocked
          // the other shuts the door on a new thread. The buyer-initiated
          // half is the more surprising case (they're the one initiating
          // contact), so we surface their own prior block clearly and
          // point at the unblock path instead of silently allowing it.
          const [sellerBlockedBuyer, buyerBlockedSeller] = await Promise.all([
            isBuyerBlocked(artisan.id, buyer.id),
            isSellerBlocked(buyer.id, artisan.id),
          ]);
          if (sellerBlockedBuyer) {
            throw new MessagingBusinessError('This maker has paused new conversations from you.');
          }
          if (buyerBlockedSeller) {
            throw new MessagingBusinessError(
              "You've blocked this maker. Unblock them from your Blocked makers list to start a conversation.",
            );
          }

          // First-image snapshot (lowest position).
          const [primaryImage] = await tx
            .select({
              url: sql<string>`(SELECT url FROM product_images WHERE product_id = ${product.id} ORDER BY position ASC LIMIT 1)`,
            })
            .from(products)
            .where(eq(products.id, product.id))
            .limit(1);

          // Insert the thread. `.returning()` with no projection
          // returns the full row (typed MessageThread), so there is
          // no follow-up SELECT — important here because this runs
          // inside the advisory-lock-held transaction and every
          // round-trip lengthens the serialized critical section.
          // The partial unique index catches a race that slipped past
          // the advisory lock; translate the constraint error to a
          // clean Result.
          let threadRow: typeof messageThreads.$inferSelect;
          try {
            const [thread] = await tx
              .insert(messageThreads)
              .values({
                buyerUserId: buyer.id,
                artisanProfileId: artisan.id,
                productId: product.id,
                productTitleSnapshot: product.title,
                productSlugSnapshot: product.slug,
                productImageUrlSnapshot: primaryImage?.url ?? null,
                artisanShopSlugSnapshot: artisan.shopSlug,
                artisanShopNameSnapshot: artisan.shopName,
              })
              .returning();
            if (!thread) throw new Error('Failed to create thread');
            threadRow = thread;
          } catch (e) {
            if (
              e instanceof Error &&
              /message_threads_active_pre_purchase_idx|duplicate key value/i.test(e.message)
            ) {
              throw new MessagingBusinessError(
                "There's already an open conversation about this piece. Continue it from your inbox.",
              );
            }
            throw e;
          }
          const threadId = threadRow.id;

          // Insert the first message.
          await tx.insert(messages).values({
            threadId,
            senderUserId: buyer.id,
            senderRole: 'buyer',
            body: parsed.data.initialMessage,
          });

          // Fan-out the seller notification — pass the row returned by
          // the INSERT directly; no re-SELECT.
          await fanOutMessageNotification(tx, threadRow, 'buyer', {
            body: parsed.data.initialMessage,
          });

          // Idempotency cache row inside the transaction (same
          // pattern as placeOrder — see its docblock for the
          // three-part discipline). withIdempotency's post-fn() insert
          // is a no-op via onConflictDoNothing. The key is required
          // (§4.5), so this always runs.
          await tx
            .insert(idempotencyKeys)
            .values({
              key: parsed.data.idempotencyKey,
              userId: buyer.id,
              scope: 'createPrePurchaseThread',
              responseJson: JSON.stringify(ok({ threadId })),
              expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS),
            })
            .onConflictDoNothing();

          return { kind: 'fresh' as const, threadId };
        });

        if (result.kind === 'cached') {
          log.info(
            { idempotencyKey: parsed.data.idempotencyKey, productId: parsed.data.productId },
            'createPrePurchaseThread cache-hit-inside-lock',
          );
          return result.cached;
        }

        log.info(
          { threadId: result.threadId, productId: parsed.data.productId },
          'pre-purchase thread created',
        );

        // The seller's Messages badge and the buyer's inbox both
        // refresh on next render — invalidate the layouts.
        revalidatePath('/dashboard', 'layout');
        revalidatePath('/account', 'layout');

        return ok({ threadId: result.threadId });
      } catch (e) {
        if (e instanceof MessagingBusinessError) {
          return err(e.message);
        }
        log.error({ err: e, productId: parsed.data.productId }, 'createPrePurchaseThread failed');
        throw e;
      }
    },
  });
}

/**
 * Append a message to an existing thread. Either party may call this.
 * No idempotency wrapper — repeated retries with the same body are a
 * user-visible duplicate (different message rows). The burst limit
 * catches accidental rapid retries; intentional retries are deliberate.
 */
export async function sendMessage(input: unknown): Promise<Result<{ messageId: string }>> {
  const log = await getRequestLogger();
  const parsed = sendMessageSchema.safeParse(input);
  if (!parsed.success) {
    return err('Invalid input', parsed.error.flatten().fieldErrors);
  }

  const sender = await requireUser().catch(() => null);
  if (!sender) return err('Not authenticated');

  const accessResult = await assertThreadAccess(parsed.data.threadId, sender.id);
  if (!accessResult.ok) return err(accessResult.error);
  const { thread, role } = accessResult.data;

  // Rate limits before doing any writes.
  if (await isAtDailyMessageLimit(sender.id)) {
    log.info({ senderUserId: sender.id }, 'daily message rate limit hit');
    return err('You have reached the daily message limit. Try again tomorrow.');
  }
  if (await isAtThreadBurstLimit(sender.id, thread.id)) {
    log.info({ senderUserId: sender.id, threadId: thread.id }, 'thread burst rate limit hit');
    return err('Slow down a moment — you can send another message in a minute.');
  }

  // Block check — gates PRE-PURCHASE threads only, and the effect is
  // symmetric: if EITHER side has blocked the other, NEITHER side can
  // send. A block pauses the conversation for both parties until the
  // blocker unblocks (mirroring how every messaging product treats a
  // mutual relationship pause).
  //
  // Blocks do NOT mute an order-anchored thread. Once an order exists
  // both parties have accepted a live commercial relationship — they
  // must be able to coordinate payment and shipping, and a disputed
  // order's thread (reopened by getWriteState) must stay writable for
  // both sides. A party who wants out of a soured order uses cancel or
  // dispute, not block.
  if (!thread.orderId) {
    const [sellerBlockedBuyer, buyerBlockedSeller] = await Promise.all([
      isBuyerBlocked(thread.artisanProfileId, thread.buyerUserId),
      isSellerBlocked(thread.buyerUserId, thread.artisanProfileId),
    ]);
    if (role === 'buyer') {
      if (sellerBlockedBuyer) {
        return err('This maker has paused new conversations from you.');
      }
      if (buyerBlockedSeller) {
        return err(
          "You've blocked this maker. Unblock them from your Blocked makers list to continue.",
        );
      }
    } else {
      if (buyerBlockedSeller) {
        return err('This buyer has paused new conversations from you.');
      }
      if (sellerBlockedBuyer) {
        return err("You've blocked this buyer. Unblock them from your settings to continue.");
      }
    }
  }

  // Write state — computed from order status, so a thread becomes
  // read-only the moment its order terminates.
  const writeState = await getWriteState(thread);
  if (writeState.kind === 'closed') {
    return err('This conversation is closed.');
  }

  let messageId: string;
  try {
    messageId = await db.transaction(async (tx) => {
      const [m] = await tx
        .insert(messages)
        .values({
          threadId: thread.id,
          senderUserId: sender.id,
          senderRole: role,
          body: parsed.data.body,
        })
        .returning({ id: messages.id });
      if (!m) throw new Error('Failed to insert message');

      // Bump thread updated_at so the inbox surfaces this thread.
      await tx
        .update(messageThreads)
        .set({ updatedAt: new Date() })
        .where(eq(messageThreads.id, thread.id));

      await fanOutMessageNotification(tx, thread, role, { body: parsed.data.body });

      return m.id;
    });
  } catch (e) {
    log.error({ err: e, threadId: thread.id }, 'sendMessage failed');
    throw e;
  }

  // Refresh both audience layouts so badges and inboxes stay in sync.
  revalidatePath('/dashboard', 'layout');
  revalidatePath('/account', 'layout');

  return ok({ messageId });
}

/**
 * Mark every unread new_message notification for this thread + this
 * user as read. Used when the recipient opens the thread page.
 *
 * IDOR-safe via WHERE user_id = current.id. Idempotent: a thread the
 * user has already cleared is a no-op — and in that no-op case it
 * performs ZERO cache invalidation (see below). This action is called
 * on EVERY thread-page render and every embedded-thread render, so an
 * unconditional revalidate would thrash the layout cache.
 */
export async function markThreadRead(input: unknown): Promise<Result<null>> {
  const parsed = markThreadReadSchema.safeParse(input);
  if (!parsed.success) return err('Invalid input', parsed.error.flatten().fieldErrors);

  const current = await requireUser().catch(() => null);
  if (!current) return err('Not authenticated');

  // `.returning()` lets us detect whether any unread row was actually
  // cleared. Re-opening an already-read thread updates nothing, so we
  // skip revalidation entirely in that case.
  const cleared = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.userId, current.id),
        eq(notifications.threadId, parsed.data.threadId),
        eq(notifications.type, 'new_message'),
        isNull(notifications.readAt),
      ),
    )
    .returning({ id: notifications.id });

  if (cleared.length > 0) {
    // Both layouts are revalidated deliberately: the Messages badge
    // renders in the buyer account sidebar AND the seller dashboard
    // sidebar, and a single user can be both buyer-on-some-threads
    // and seller-on-other-threads (an artisan is also a `user` who
    // can buy). The badges are scoped per-side
    // (getUnreadBuyerMessagesCount / getUnreadSellerMessagesCount, so
    // each surface shows the count of threads IT actually renders);
    // revalidating both ensures whichever surface the viewer is on
    // updates. Only fires when a row actually changed.
    //
    // Cost tradeoff (round-2 review Issue 4): markThreadRead runs on
    // every thread-page render and every embedded-thread render, so
    // the first open of each unread thread invalidates BOTH whole
    // layout subtrees. The `cleared.length > 0` gate keeps steady-
    // state re-opens free, but working through an inbox of N unread
    // threads costs N pairs of full-layout invalidations. Acceptable
    // for v1 (consistent with markReadAction in
    // lib/actions/notifications.ts). Escape hatch if inbox navigation
    // ever feels sluggish: replace these two revalidatePath calls with
    // a narrow revalidateTag(`messages-badge:${current.id}`) that only
    // the badge COUNT query reads, instead of invalidating the whole
    // layout subtree.
    revalidatePath('/account', 'layout');
    revalidatePath('/dashboard', 'layout');
  }
  return ok(null);
}

/**
 * Seller-only. Adds the (artisanProfileId, blockedUserId) row to
 * sellerBlockedBuyers. Composite primary key means the second call
 * with the same pair is a no-op via onConflictDoNothing.
 */
export async function blockBuyer(input: unknown): Promise<Result<null>> {
  const parsed = blockBuyerSchema.safeParse(input);
  if (!parsed.success) return err('Invalid input', parsed.error.flatten().fieldErrors);

  const seller = await requireArtisan().catch(() => null);
  if (!seller) return err('Artisan profile required');

  // Self-block protection.
  if (seller.userId === parsed.data.blockedUserId) {
    return err('You cannot block yourself.');
  }

  await db
    .insert(sellerBlockedBuyers)
    .values({
      artisanProfileId: seller.id,
      blockedUserId: parsed.data.blockedUserId,
      reason: parsed.data.reason ?? null,
    })
    .onConflictDoNothing();

  revalidatePath('/dashboard', 'layout');
  return ok(null);
}

export async function unblockBuyer(input: unknown): Promise<Result<null>> {
  const parsed = unblockBuyerSchema.safeParse(input);
  if (!parsed.success) return err('Invalid input', parsed.error.flatten().fieldErrors);

  const seller = await requireArtisan().catch(() => null);
  if (!seller) return err('Artisan profile required');

  await db
    .delete(sellerBlockedBuyers)
    .where(
      and(
        eq(sellerBlockedBuyers.artisanProfileId, seller.id),
        eq(sellerBlockedBuyers.blockedUserId, parsed.data.blockedUserId),
      ),
    );

  revalidatePath('/dashboard', 'layout');
  return ok(null);
}

/**
 * Buyer-only. Adds the (buyerUserId, blockedArtisanProfileId) row to
 * buyerBlockedSellers. Mirror of blockBuyer — the composite primary
 * key means the second call with the same pair is a no-op via
 * onConflictDoNothing.
 */
export async function blockSeller(input: unknown): Promise<Result<null>> {
  const parsed = blockSellerSchema.safeParse(input);
  if (!parsed.success) return err('Invalid input', parsed.error.flatten().fieldErrors);

  const buyer = await requireUser().catch(() => null);
  if (!buyer) return err('Not authenticated');

  // Self-block protection — the buyer can't block an artisan they own.
  const [artisan] = await db
    .select({ userId: artisanProfiles.userId })
    .from(artisanProfiles)
    .where(eq(artisanProfiles.id, parsed.data.blockedArtisanProfileId))
    .limit(1);
  if (artisan && artisan.userId === buyer.id) {
    return err('You cannot block your own shop.');
  }

  await db
    .insert(buyerBlockedSellers)
    .values({
      buyerUserId: buyer.id,
      blockedArtisanProfileId: parsed.data.blockedArtisanProfileId,
      reason: parsed.data.reason ?? null,
    })
    .onConflictDoNothing();

  revalidatePath('/account', 'layout');
  return ok(null);
}

export async function unblockSeller(input: unknown): Promise<Result<null>> {
  const parsed = unblockSellerSchema.safeParse(input);
  if (!parsed.success) return err('Invalid input', parsed.error.flatten().fieldErrors);

  const buyer = await requireUser().catch(() => null);
  if (!buyer) return err('Not authenticated');

  await db
    .delete(buyerBlockedSellers)
    .where(
      and(
        eq(buyerBlockedSellers.buyerUserId, buyer.id),
        eq(buyerBlockedSellers.blockedArtisanProfileId, parsed.data.blockedArtisanProfileId),
      ),
    );

  revalidatePath('/account', 'layout');
  return ok(null);
}
