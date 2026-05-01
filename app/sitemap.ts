import type { MetadataRoute } from 'next';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { artisanProfiles, products } from '@/db/schema';

export const revalidate = 3600;

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

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
    ...artisanRows.map((a) => ({
      url: `${APP_URL}/shop/${a.slug}`,
      lastModified: a.updatedAt,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
    ...productRows.map((p) => ({
      url: `${APP_URL}/shop/${p.artisanSlug}/${p.productSlug}`,
      lastModified: p.updatedAt,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
  ];
}
