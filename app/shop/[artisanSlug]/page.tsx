import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { artisanProfiles, productImages, products } from '@/db/schema';
import { formatPrice } from '@/lib/format';

export const revalidate = 300;

type Params = Promise<{ artisanSlug: string }>;

async function loadArtisan(artisanSlug: string) {
  const [profile] = await db
    .select()
    .from(artisanProfiles)
    .where(eq(artisanProfiles.shopSlug, artisanSlug))
    .limit(1);
  return profile ?? null;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { artisanSlug } = await params;
  const profile = await loadArtisan(artisanSlug);
  if (!profile) return { title: 'Shop not found' };
  const description = profile.bio ?? `Handmade work by ${profile.shopName} on Balikha.`;
  return {
    title: profile.shopName,
    description,
    openGraph: {
      title: profile.shopName,
      description,
      url: `/shop/${profile.shopSlug}`,
      images: profile.bannerImageUrl ? [{ url: profile.bannerImageUrl }] : undefined,
    },
  };
}

export default async function ArtisanStorefrontPage({ params }: { params: Params }) {
  const { artisanSlug } = await params;
  const profile = await loadArtisan(artisanSlug);
  if (!profile) notFound();

  const productList = await db
    .select()
    .from(products)
    .where(and(eq(products.artisanProfileId, profile.id), eq(products.status, 'published')))
    .orderBy(desc(products.createdAt));

  // Primary image per product = position 0 (asc by position, take first per product)
  const primaryByProductId = new Map<
    string,
    { url: string; width: number | null; height: number | null; altText: string | null }
  >();
  if (productList.length > 0) {
    const imageRows = await db
      .select({
        productId: productImages.productId,
        url: productImages.url,
        width: productImages.width,
        height: productImages.height,
        altText: productImages.altText,
      })
      .from(productImages)
      .where(
        inArray(
          productImages.productId,
          productList.map((p) => p.id),
        ),
      )
      .orderBy(asc(productImages.position));
    for (const img of imageRows) {
      if (!primaryByProductId.has(img.productId)) primaryByProductId.set(img.productId, img);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <header className="mb-10 space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">{profile.shopName}</h1>
        {profile.location && <p className="text-muted-foreground text-sm">{profile.location}</p>}
        {profile.bio && <p className="max-w-2xl text-base leading-relaxed">{profile.bio}</p>}
      </header>

      {productList.length === 0 ? (
        <p className="text-muted-foreground">No products listed yet. Check back soon.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {productList.map((p) => {
            const img = primaryByProductId.get(p.id);
            return (
              <li key={p.id}>
                <Link
                  href={`/shop/${profile.shopSlug}/${p.slug}`}
                  className="group block space-y-3"
                >
                  <div className="bg-muted relative aspect-square overflow-hidden rounded-lg">
                    {img ? (
                      <Image
                        src={img.url}
                        alt={img.altText ?? p.title}
                        fill
                        sizes="(min-width: 1024px) 320px, (min-width: 640px) 50vw, 100vw"
                        className="object-cover transition-transform group-hover:scale-105"
                      />
                    ) : (
                      <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
                        No image
                      </div>
                    )}
                  </div>
                  <div>
                    <h2 className="font-medium">{p.title}</h2>
                    <p className="text-muted-foreground text-sm">
                      {formatPrice(p.price, p.currency)}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
