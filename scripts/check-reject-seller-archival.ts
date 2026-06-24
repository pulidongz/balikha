// Verifies archiveListingsForRejectedSeller (issue #124): rejecting a seller
// flips their published/sold_out products to `archived` WITHOUT recording
// previous_status (permanent takedown; reconciler-proof), and leaves draft /
// self-archived products untouched. Also verifies that products already
// archived by a prior suspension (previousStatus set) have previousStatus
// cleared — so the reconciler never auto-restores a rejected seller's products.
// Runs inside a sentinel-rolled-back transaction so it leaves the dev DB
// unchanged. Requires `npm run db:seed`.
import { eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { catalogs, products } from '@/db/schema';
import { archiveListingsForRejectedSeller } from '@/lib/admin/seller-content';

const SENTINEL = 'ROLLBACK_SENTINEL';

let failures = 0;
function pass(msg: string): void {
  process.stdout.write(`✓ ${msg}\n`);
}
function fail(msg: string): void {
  failures += 1;
  console.error(`✗ ${msg}`);
}
function assertEqual<T>(name: string, actual: T, expected: T): void {
  if (actual === expected) pass(`${name}: ${String(actual)}`);
  else fail(`${name}: got "${String(actual)}" expected "${String(expected)}"`);
}

async function main(): Promise<void> {
  // Find any seeded catalog -> gives a real artisanProfileId + catalogId to
  // hang fixtures on (mirrors check-admin-product-moderation's find-a-row style).
  const [seedCatalog] = await db
    .select({ id: catalogs.id, artisanProfileId: catalogs.artisanProfileId })
    .from(catalogs)
    .limit(1);
  if (!seedCatalog) {
    fail('no seeded catalog found — run `npm run db:seed` first');
    process.exit(1);
  }

  let firstFixtureId: string | null = null;

  try {
    await db.transaction(async (tx) => {
      // Five representative products under one rejected seller.
      const rows = await tx
        .insert(products)
        .values([
          {
            catalogId: seedCatalog.id,
            artisanProfileId: seedCatalog.artisanProfileId,
            slug: 'reject-test-published',
            title: 'Reject Test Published',
            status: 'published',
            price: '100.00',
          },
          {
            catalogId: seedCatalog.id,
            artisanProfileId: seedCatalog.artisanProfileId,
            slug: 'reject-test-soldout',
            title: 'Reject Test SoldOut',
            status: 'sold_out',
            price: '100.00',
          },
          {
            catalogId: seedCatalog.id,
            artisanProfileId: seedCatalog.artisanProfileId,
            slug: 'reject-test-draft',
            title: 'Reject Test Draft',
            status: 'draft',
            price: '100.00',
          },
          {
            catalogId: seedCatalog.id,
            artisanProfileId: seedCatalog.artisanProfileId,
            slug: 'reject-test-selfarchived',
            title: 'Reject Test SelfArchived',
            status: 'archived',
            price: '100.00',
          },
          {
            catalogId: seedCatalog.id,
            artisanProfileId: seedCatalog.artisanProfileId,
            slug: 'reject-test-suspended-archived',
            title: 'Reject Test Suspended Archived',
            status: 'archived',
            previousStatus: 'published',
            price: '100.00',
          },
        ])
        .returning({ id: products.id });
      const [published, soldOut, draft, selfArchived, suspendedArchived] = rows;
      if (!published || !soldOut || !draft || !selfArchived || !suspendedArchived) {
        fail('fixture insert did not return 5 rows');
        throw new Error(SENTINEL);
      }
      firstFixtureId = published.id;

      // Act: reject this seller's listings.
      await archiveListingsForRejectedSeller(seedCatalog.artisanProfileId, tx);

      const afterRows = await tx
        .select({
          id: products.id,
          status: products.status,
          previousStatus: products.previousStatus,
        })
        .from(products)
        .where(
          inArray(products.id, [
            published.id,
            soldOut.id,
            draft.id,
            selfArchived.id,
            suspendedArchived.id,
          ]),
        );
      const byId = new Map(afterRows.map((p) => [p.id, p]));

      assertEqual('published -> archived', byId.get(published.id)?.status, 'archived');
      assertEqual(
        'published previousStatus stays null',
        byId.get(published.id)?.previousStatus ?? null,
        null,
      );
      assertEqual('sold_out -> archived', byId.get(soldOut.id)?.status, 'archived');
      assertEqual(
        'sold_out previousStatus stays null',
        byId.get(soldOut.id)?.previousStatus ?? null,
        null,
      );
      assertEqual('draft untouched', byId.get(draft.id)?.status, 'draft');
      assertEqual('self-archived untouched', byId.get(selfArchived.id)?.status, 'archived');
      assertEqual(
        'suspended-archived stays archived',
        byId.get(suspendedArchived.id)?.status,
        'archived',
      );
      assertEqual(
        'suspended-archived previousStatus cleared',
        byId.get(suspendedArchived.id)?.previousStatus ?? null,
        null,
      );

      // Idempotency: a second call is a safe no-op.
      await archiveListingsForRejectedSeller(seedCatalog.artisanProfileId, tx);
      const [afterTwice] = await tx
        .select({ status: products.status })
        .from(products)
        .where(eq(products.id, published.id));
      assertEqual('idempotent second call', afterTwice?.status, 'archived');

      // Roll everything back — leave the dev DB pristine.
      throw new Error(SENTINEL);
    });
  } catch (err) {
    if (!(err instanceof Error) || err.message !== SENTINEL) {
      fail(`unexpected error: ${String(err)}`);
      process.exit(1);
    }
    pass('transaction rolled back via sentinel');
  }

  // Confirm rollback really discarded the fixtures.
  if (firstFixtureId !== null) {
    const leftover = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.id, firstFixtureId));
    assertEqual('fixtures rolled back (no leftover)', leftover.length, 0);
  }

  if (failures > 0) {
    console.error(`${failures} check(s) failed.`);
    process.exit(1);
  }
  process.stdout.write('All reject-seller-archival checks passed.\n');
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error('check-reject-seller-archival crashed:', err);
  process.exit(1);
});
