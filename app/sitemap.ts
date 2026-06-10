import type { MetadataRoute } from 'next';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { artisanProfiles, products } from '@/db/schema';
import { env } from '@/env';
import { studioPath, workPath } from '@/lib/routes';

// Generated per-request, not at build time. Without this, Next tries
// to prerender the sitemap as part of `next build`, which would require
// a live database during the build — fine in dev, broken in CI where
// only dummy DB credentials exist. Sitemaps for a marketplace want to
// reflect new listings anyway; per-request with edge caching is the
// natural fit.
export const dynamic = 'force-dynamic';

const APP_URL = env.NEXT_PUBLIC_APP_URL;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const artisanRows = await db
    .select({
      slug: artisanProfiles.shopSlug,
      updatedAt: artisanProfiles.updatedAt,
    })
    .from(artisanProfiles);

  const productRows = await db
    .select({
      artisanSlug: artisanProfiles.shopSlug,
      productSlug: products.slug,
      updatedAt: products.updatedAt,
    })
    .from(products)
    .innerJoin(artisanProfiles, eq(artisanProfiles.id, products.artisanProfileId))
    .where(eq(products.status, 'published'));

  return [
    {
      url: APP_URL,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    // Static marketing pages. No lastModified — these change rarely and
    // only via deploys, so advertising a fake freshness date helps nobody.
    { url: `${APP_URL}/about`, changeFrequency: 'monthly' as const, priority: 0.6 },
    { url: `${APP_URL}/contact`, changeFrequency: 'monthly' as const, priority: 0.5 },
    { url: `${APP_URL}/search`, changeFrequency: 'weekly' as const, priority: 0.5 },
    { url: `${APP_URL}/terms`, changeFrequency: 'yearly' as const, priority: 0.3 },
    { url: `${APP_URL}/privacy`, changeFrequency: 'yearly' as const, priority: 0.3 },
    ...artisanRows.map((a) => ({
      url: `${APP_URL}${studioPath(a.slug)}`,
      lastModified: a.updatedAt,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
    ...productRows.map((p) => ({
      url: `${APP_URL}${workPath(p.artisanSlug, p.productSlug)}`,
      lastModified: p.updatedAt,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
  ];
}
