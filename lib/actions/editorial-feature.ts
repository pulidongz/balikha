'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { artisanProfiles, homepageFeature, products } from '@/db/schema';
import { ADMIN_REQUIRED_MESSAGE, tryRequireAdmin } from '@/lib/auth-helpers';
import { recordAdminAction } from '@/lib/admin/audit';
import { ok, err, type Result } from '@/lib/result';
import { getRequestLogger } from '@/lib/logger-context';

const MAX_FEATURED_WORKS = 8;

const inputSchema = z.object({
  // Studio slug, or empty to clear the artist feature.
  artisanSlug: z.string().trim().max(120),
  editorialText: z.string().trim().max(1000),
  // One "artisan-slug/product-slug" per line, or empty to clear.
  workSlugs: z.string().trim().max(2000),
});

// Founder-curated, never paid (T15). Slugs in, ids out — the founder
// works with URLs they can see, not database ids.
export async function updateEditorialFeatureAction(
  input: unknown,
): Promise<Result<{ works: number }>> {
  const log = await getRequestLogger();

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return err('Invalid input');

  const admin = await tryRequireAdmin();
  if (!admin) return err(ADMIN_REQUIRED_MESSAGE);

  const { artisanSlug, editorialText, workSlugs } = parsed.data;

  let artisanProfileId: string | null = null;
  if (artisanSlug) {
    const [artisan] = await db
      .select({ id: artisanProfiles.id })
      .from(artisanProfiles)
      .where(eq(artisanProfiles.shopSlug, artisanSlug))
      .limit(1);
    if (!artisan) return err(`No studio with slug “${artisanSlug}”.`);
    artisanProfileId = artisan.id;
  }

  const lines = workSlugs
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length > MAX_FEATURED_WORKS) {
    return err(`Up to ${MAX_FEATURED_WORKS} featured works.`);
  }

  const featuredProductIds: string[] = [];
  if (lines.length > 0) {
    const pairs = lines.map((line) => {
      const [shop, work] = line.split('/').map((s) => s.trim());
      return { shop, work, line };
    });
    for (const p of pairs) {
      if (!p.shop || !p.work) {
        return err(`“${p.line}” is not in artisan-slug/work-slug form.`);
      }
    }

    const rows = await db
      .select({ id: products.id, slug: products.slug, shopSlug: artisanProfiles.shopSlug })
      .from(products)
      .innerJoin(artisanProfiles, eq(artisanProfiles.id, products.artisanProfileId))
      .where(
        inArray(
          products.slug,
          pairs.map((p) => p.work as string),
        ),
      );
    for (const p of pairs) {
      const match = rows.find((r) => r.slug === p.work && r.shopSlug === p.shop);
      if (!match) return err(`No work found for “${p.line}”.`);
      featuredProductIds.push(match.id);
    }
  }

  await db
    .insert(homepageFeature)
    .values({
      id: 'homepage',
      artisanProfileId,
      editorialText: editorialText || null,
      featuredProductIds,
      updatedAt: new Date(),
      updatedById: admin.id,
    })
    .onConflictDoUpdate({
      target: homepageFeature.id,
      set: {
        artisanProfileId,
        editorialText: editorialText || null,
        featuredProductIds,
        updatedAt: new Date(),
        updatedById: admin.id,
      },
    });

  await recordAdminAction({
    actorUserId: admin.id,
    action: 'update_editorial_feature',
    targetUserId: null,
    metadata: { artisanProfileId, works: featuredProductIds.length },
  });

  log.info(
    { adminUserId: admin.id, artisanProfileId, works: featuredProductIds.length },
    'Editorial feature updated',
  );
  revalidatePath('/');
  return ok({ works: featuredProductIds.length });
}
