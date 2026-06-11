import { eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { artisanProfiles, homepageFeature, products } from '@/db/schema';
import { requireAdmin } from '@/lib/auth-helpers';
import { EditorialFeatureForm } from '@/components/admin/editorial-feature-form';

export const metadata = {
  title: 'Editorial Featuring — Admin',
};

// Founder-curated homepage feature (T15). Changing it is a form submit —
// no deploy. Paid placement is out of scope, indefinitely.
export default async function AdminFeaturingPage() {
  await requireAdmin();

  const [row] = await db.select().from(homepageFeature).limit(1);

  let artisanSlug = '';
  if (row?.artisanProfileId) {
    const [a] = await db
      .select({ shopSlug: artisanProfiles.shopSlug })
      .from(artisanProfiles)
      .where(eq(artisanProfiles.id, row.artisanProfileId))
      .limit(1);
    artisanSlug = a?.shopSlug ?? '';
  }

  let workSlugs = '';
  if (row && row.featuredProductIds.length > 0) {
    const rows = await db
      .select({ id: products.id, slug: products.slug, shopSlug: artisanProfiles.shopSlug })
      .from(products)
      .innerJoin(artisanProfiles, eq(artisanProfiles.id, products.artisanProfileId))
      .where(inArray(products.id, row.featuredProductIds));
    const byId = new Map(rows.map((r) => [r.id, r]));
    workSlugs = row.featuredProductIds
      .map((id) => byId.get(id))
      .filter((r): r is NonNullable<typeof r> => r !== undefined)
      .map((r) => `${r.shopSlug}/${r.slug}`)
      .join('\n');
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
        defaults={{
          artisanSlug,
          editorialText: row?.editorialText ?? '',
          workSlugs,
        }}
      />
    </div>
  );
}
