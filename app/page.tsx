import Image from 'next/image';
import Link from 'next/link';
import { asc, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { artisanProfiles, productImages, products } from '@/db/schema';
import { formatPrice } from '@/lib/format';
import { getCurrentSession } from '@/lib/auth-helpers';

export const revalidate = 300;

const PAGE_SIZE = 24;

type SearchParams = Promise<{ page?: string }>;

export default async function HomePage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  // Fetch one extra row to know whether there's a next page without a count(*)
  const rows = await db
    .select({
      id: products.id,
      slug: products.slug,
      title: products.title,
      price: products.price,
      currency: products.currency,
      artisanShopSlug: artisanProfiles.shopSlug,
      artisanShopName: artisanProfiles.shopName,
    })
    .from(products)
    .innerJoin(artisanProfiles, eq(artisanProfiles.id, products.artisanProfileId))
    .where(eq(products.status, 'published'))
    .orderBy(desc(products.createdAt))
    .limit(PAGE_SIZE + 1)
    .offset(offset);

  const hasMore = rows.length > PAGE_SIZE;
  const visible = rows.slice(0, PAGE_SIZE);

  const primaryByProductId = new Map<
    string,
    { url: string; width: number | null; height: number | null; altText: string | null }
  >();
  if (visible.length > 0) {
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
          visible.map((p) => p.id),
        ),
      )
      .orderBy(asc(productImages.position));
    for (const img of imageRows) {
      if (!primaryByProductId.has(img.productId)) primaryByProductId.set(img.productId, img);
    }
  }

  const session = await getCurrentSession();

  return (
    <>
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="font-semibold tracking-tight">
            Balikha
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            {session ? (
              <Link href="/dashboard" className="hover:underline">
                Dashboard
              </Link>
            ) : (
              <>
                <Link href="/sign-in" className="hover:underline">
                  Sign in
                </Link>
                <Link
                  href="/sign-up"
                  className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-3 py-1.5"
                >
                  Sign up
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-12">
        <section className="mb-10 space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight">Discover handmade work</h1>
          <p className="text-muted-foreground max-w-2xl">
            Original pieces from independent artisans. Browse the latest below, or visit a shop to
            see one maker&apos;s full catalog.
          </p>
        </section>

        {visible.length === 0 ? (
          <p className="text-muted-foreground">
            No products listed yet.{' '}
            {session ? (
              <Link
                href="/dashboard"
                className="text-foreground underline-offset-4 hover:underline"
              >
                Be the first.
              </Link>
            ) : (
              <Link href="/sign-up" className="text-foreground underline-offset-4 hover:underline">
                Open a shop to be the first.
              </Link>
            )}
          </p>
        ) : (
          <>
            <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visible.map((p) => {
                const img = primaryByProductId.get(p.id);
                return (
                  <li key={p.id}>
                    <Link
                      href={`/shop/${p.artisanShopSlug}/${p.slug}`}
                      className="group block space-y-3"
                    >
                      <div className="bg-muted relative aspect-square overflow-hidden rounded-lg">
                        {img ? (
                          <Image
                            src={img.url}
                            alt={img.altText ?? p.title}
                            fill
                            sizes="(min-width: 1280px) 280px, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
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
                        <p className="text-muted-foreground text-xs">{p.artisanShopName}</p>
                        <p className="mt-1 text-sm">{formatPrice(p.price, p.currency)}</p>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>

            {(page > 1 || hasMore) && (
              <nav
                aria-label="Pagination"
                className="text-muted-foreground mt-12 flex items-center justify-between text-sm"
              >
                {page > 1 ? (
                  <Link
                    href={page === 2 ? '/' : `/?page=${page - 1}`}
                    className="hover:text-foreground"
                  >
                    ← Previous
                  </Link>
                ) : (
                  <span />
                )}
                <span>Page {page}</span>
                {hasMore ? (
                  <Link href={`/?page=${page + 1}`} className="hover:text-foreground">
                    Next →
                  </Link>
                ) : (
                  <span />
                )}
              </nav>
            )}
          </>
        )}
      </main>
    </>
  );
}
