// Verifies the product moderation state-machine helpers (ticket #31) in a
// rolled-back transaction so the dev DB is left unchanged. Run against a
// seeded dev DB:
//   npm run db:seed && npm run test:admin-product-moderation
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { products, user } from '@/db/schema';
import {
  flagListingInTx,
  reinstateListingInTx,
  removeListingInTx,
} from '@/lib/admin/product-moderation';

let failures = 0;

function pass(msg: string): void {
  process.stdout.write(`✓ ${msg}\n`);
}

function fail(msg: string): void {
  failures += 1;
  console.error(`✗ ${msg}`);
}

function assertEqual<T>(name: string, actual: T, expected: T): void {
  if (actual === expected) {
    pass(`${name}: ${String(actual)}`);
  } else {
    fail(`${name}: got "${String(actual)}" expected "${String(expected)}"`);
  }
}

const SENTINEL = 'ROLLBACK_SENTINEL';

async function main(): Promise<void> {
  // Find a published product in the DB to exercise against.
  const [productRow] = await db
    .select({
      id: products.id,
      status: products.status,
      moderationStatus: products.moderationStatus,
    })
    .from(products)
    .where(eq(products.status, 'published'))
    .limit(1);

  if (!productRow) {
    fail('No published product found — run `npm run db:seed` first');
    process.exit(1);
  }

  const productId = productRow.id;
  const originalStatus = productRow.status;
  const originalModerationStatus = productRow.moderationStatus;

  process.stdout.write(
    `\nTesting against product ${productId} (status=${originalStatus}, moderationStatus=${originalModerationStatus})\n\n`,
  );

  // Find an admin user to use as the actor.
  const [adminRow] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.role, 'admin'))
    .limit(1);

  if (!adminRow) {
    // Fallback: use any user as actor (the helpers only record the id string).
    const [anyUser] = await db.select({ id: user.id }).from(user).limit(1);
    if (!anyUser) {
      fail('No users found — run `npm run db:seed` first');
      process.exit(1);
    }
  }

  const adminId = adminRow?.id ?? (await db.select({ id: user.id }).from(user).limit(1))[0]?.id;
  if (!adminId) {
    fail('Could not resolve an admin user id');
    process.exit(1);
  }

  try {
    await db.transaction(async (tx) => {
      // -----------------------------------------------------------------------
      // 1. flag → check moderationStatus=flagged, status unchanged
      // -----------------------------------------------------------------------
      await flagListingInTx(tx, { productId, reason: 'test flag reason', adminUserId: adminId });

      const [afterFlag] = await tx
        .select({ status: products.status, moderationStatus: products.moderationStatus })
        .from(products)
        .where(eq(products.id, productId));

      if (!afterFlag) {
        fail('product not found after flagListingInTx');
      } else {
        assertEqual('after flag: moderationStatus', afterFlag.moderationStatus, 'flagged');
        assertEqual('after flag: status unchanged', afterFlag.status, originalStatus);
      }

      // -----------------------------------------------------------------------
      // 2. reinstate (from flagged) → moderationStatus=none
      // -----------------------------------------------------------------------
      await reinstateListingInTx(tx, { productId, adminUserId: adminId });

      const [afterReinstate1] = await tx
        .select({ status: products.status, moderationStatus: products.moderationStatus })
        .from(products)
        .where(eq(products.id, productId));

      if (!afterReinstate1) {
        fail('product not found after reinstateListingInTx (from flagged)');
      } else {
        assertEqual(
          'after reinstate(flagged): moderationStatus',
          afterReinstate1.moderationStatus,
          'none',
        );
        assertEqual('after reinstate(flagged): status', afterReinstate1.status, originalStatus);
      }

      // -----------------------------------------------------------------------
      // 3. remove → status=archived, moderationStatus=removed, reason set
      // -----------------------------------------------------------------------
      const removeReason = 'test removal reason';
      await removeListingInTx(tx, { productId, reason: removeReason, adminUserId: adminId });

      const [afterRemove] = await tx
        .select({
          status: products.status,
          moderationStatus: products.moderationStatus,
          moderationReason: products.moderationReason,
        })
        .from(products)
        .where(eq(products.id, productId));

      if (!afterRemove) {
        fail('product not found after removeListingInTx');
      } else {
        assertEqual('after remove: status', afterRemove.status, 'archived');
        assertEqual('after remove: moderationStatus', afterRemove.moderationStatus, 'removed');
        assertEqual('after remove: moderationReason', afterRemove.moderationReason, removeReason);
      }

      // -----------------------------------------------------------------------
      // 4. Assert republish invariant: row has moderationStatus='removed'
      //    (this is the condition Task 1.3 checks before rejecting publish)
      // -----------------------------------------------------------------------
      const [removedRow] = await tx
        .select({ moderationStatus: products.moderationStatus })
        .from(products)
        .where(eq(products.id, productId));

      if (!removedRow) {
        fail('product not found for republish invariant check');
      } else {
        assertEqual(
          'republish guard: row has moderationStatus=removed',
          removedRow.moderationStatus,
          'removed',
        );
      }

      // -----------------------------------------------------------------------
      // 5. reinstate (from removed) → status=published, moderationStatus=none
      // -----------------------------------------------------------------------
      await reinstateListingInTx(tx, { productId, adminUserId: adminId });

      const [afterReinstate2] = await tx
        .select({ status: products.status, moderationStatus: products.moderationStatus })
        .from(products)
        .where(eq(products.id, productId));

      if (!afterReinstate2) {
        fail('product not found after reinstateListingInTx (from removed)');
      } else {
        assertEqual('after reinstate(removed): status', afterReinstate2.status, 'published');
        assertEqual(
          'after reinstate(removed): moderationStatus',
          afterReinstate2.moderationStatus,
          'none',
        );
      }

      // -----------------------------------------------------------------------
      // Throw the sentinel to roll back — no DB pollution.
      // -----------------------------------------------------------------------
      throw new Error(SENTINEL);
    });
  } catch (err: unknown) {
    if (!(err instanceof Error) || err.message !== SENTINEL) {
      fail(`unexpected error during transaction: ${String(err)}`);
      process.exit(1);
    }
    // Sentinel caught — transaction rolled back. Verify the row is unchanged.
    pass('transaction rolled back via sentinel');
  }

  // --------------------------------------------------------------------------
  // 6. Assert the product row is restored to its original values (no pollution)
  // --------------------------------------------------------------------------
  const [restored] = await db
    .select({ status: products.status, moderationStatus: products.moderationStatus })
    .from(products)
    .where(eq(products.id, productId));

  if (!restored) {
    fail('product not found after rollback');
  } else {
    assertEqual('post-rollback: status restored', restored.status, originalStatus);
    assertEqual(
      'post-rollback: moderationStatus restored',
      restored.moderationStatus,
      originalModerationStatus,
    );
  }

  process.stdout.write('\n');
  if (failures > 0) {
    console.error(`${failures} check(s) failed.`);
    process.exit(1);
  }
  process.stdout.write('All admin-product-moderation checks passed.\n');
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error('check-admin-product-moderation crashed:', err);
  process.exit(1);
});
