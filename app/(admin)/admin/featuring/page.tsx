import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { artisanProfiles, homepageFeature, products } from '@/db/schema';
import { requireAdmin } from '@/lib/auth-helpers';
import { EditorialFeatureForm } from '@/components/admin/editorial-feature-form';

export const metadata = {
  title: 'Editorial Featuring — Admin',
};

// Founder-curated homepage feature (T15). Changing it is a form submit — no
// deploy. The picker preloads every approved studio and its published works
// (what the homepage actually renders) so the founder selects from real names
// instead of typing slugs. This is fine at the current scale (tens of studios,
// hundreds of works); if the catalogue grows into the thousands, switch to a
// search query.
export default async function AdminFeaturingPage() {
  await requireAdmin();

  const [row, studioRows, workRows] = await Promise.all([
    db
      .select()
      .from(homepageFeature)
      .limit(1)
      .then((rows) => rows[0]),
    db
      .select({
        id: artisanProfiles.id,
        name: artisanProfiles.shopName,
        slug: artisanProfiles.shopSlug,
      })
      .from(artisanProfiles)
      .where(eq(artisanProfiles.approvalStatus, 'approved'))
      .orderBy(asc(artisanProfiles.shopName)),
    db
      .select({
        id: products.id,
        title: products.title,
        slug: products.slug,
        studioSlug: artisanProfiles.shopSlug,
      })
      .from(products)
      .innerJoin(artisanProfiles, eq(artisanProfiles.id, products.artisanProfileId))
      // Only 'published' — the homepage render query (lib/queries/editorial-
      // feature.ts) filters published, so offering sold_out here would let the
      // founder "feature" a work that never appears on the homepage.
      .where(and(eq(artisanProfiles.approvalStatus, 'approved'), eq(products.status, 'published')))
      .orderBy(asc(artisanProfiles.shopName), asc(products.title)),
  ]);

  // Default selected studio slug (the studio currently featured, if any).
  const defaultStudioSlug = row?.artisanProfileId
    ? (studioRows.find((s) => s.id === row.artisanProfileId)?.slug ?? '')
    : '';

  // Default selected works — only those that still exist, are featurable, and
  // belong to the default studio, preserving the saved order. (The feature is
  // "one studio, a row of their works", so works are scoped to that studio.)
  const workIdsInStudio = new Set(
    workRows.filter((w) => w.studioSlug === defaultStudioSlug).map((w) => w.id),
  );
  const savedIds = row?.featuredProductIds ?? [];
  const defaultWorkIds = savedIds.filter((id) => workIdsInStudio.has(id));

  // The old freeform allowed featured works from ANY studio. This single-studio
  // picker can only show the featured studio's works, so saving would drop
  // currently-featured works from other studios. Surface them explicitly rather
  // than dropping silently (CLAUDE.md: never mask data loss).
  const keptIds = new Set(defaultWorkIds);
  let droppedWorks: { id: string; title: string; studioSlug: string }[] = [];
  if (savedIds.length > 0) {
    const savedRows = await db
      .select({
        id: products.id,
        title: products.title,
        studioSlug: artisanProfiles.shopSlug,
      })
      .from(products)
      .innerJoin(artisanProfiles, eq(artisanProfiles.id, products.artisanProfileId))
      .where(and(inArray(products.id, savedIds), eq(products.status, 'published')));
    droppedWorks = savedRows.filter((r) => !keptIds.has(r.id));
  }

  return (
    <div className="max-w-2xl space-y-6">
      <header>
        <h1 className="font-serif text-3xl">Editorial featuring</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Curated, never paid. What you set here is the homepage feature, the gallery positioning,
          and the recruitment pitch all at once.
        </p>
      </header>
      <EditorialFeatureForm
        studios={studioRows}
        works={workRows}
        droppedWorks={droppedWorks}
        defaults={{
          studioSlug: defaultStudioSlug,
          editorialText: row?.editorialText ?? '',
          workIds: defaultWorkIds,
        }}
      />
    </div>
  );
}
