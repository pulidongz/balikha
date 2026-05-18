import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { catalogs, productImages, products } from '@/db/schema';
import { requireSellerProfile } from '@/lib/auth-helpers';
import { ProductForm } from '@/components/dashboard/product-form';
import { ProductStatusButtons } from '@/components/dashboard/product-status-buttons';

export const metadata = {
  title: 'Edit product',
};

export default async function ProductDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ catalogSlug: string; productSlug: string }>;
  searchParams: Promise<{ imagesFailed?: string }>;
}) {
  const { catalogSlug, productSlug } = await params;
  const { imagesFailed } = await searchParams;
  // Ephemeral marker set by the create flow when a photo upload failed. Not
  // persisted — a bookmarked URL could re-show it, which is harmless.
  const failedCount = Number(imagesFailed);
  const showImagesFailedNotice = Number.isInteger(failedCount) && failedCount > 0;
  const profile = await requireSellerProfile();

  const [catalog] = await db
    .select({ id: catalogs.id, slug: catalogs.slug, title: catalogs.title })
    .from(catalogs)
    .where(and(eq(catalogs.artisanProfileId, profile.id), eq(catalogs.slug, catalogSlug)))
    .limit(1);
  if (!catalog) notFound();

  const [product] = await db
    .select()
    .from(products)
    .where(
      and(
        eq(products.artisanProfileId, profile.id),
        eq(products.catalogId, catalog.id),
        eq(products.slug, productSlug),
      ),
    )
    .limit(1);
  if (!product) notFound();

  const images = await db
    .select({
      id: productImages.id,
      url: productImages.url,
      width: productImages.width,
      height: productImages.height,
      altText: productImages.altText,
    })
    .from(productImages)
    .where(eq(productImages.productId, product.id))
    .orderBy(asc(productImages.position));

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-6 py-12">
      <header>
        <p className="text-muted-foreground text-sm">
          <Link href={`/dashboard/catalogs/${catalog.slug}`} className="hover:underline">
            ← {catalog.title}
          </Link>
        </p>
        <div className="mt-2 flex items-start justify-between gap-4">
          <div>
            <h1 className="font-serif text-2xl tracking-tight">{product.title}</h1>
            <p className="text-muted-foreground text-sm">/{product.slug}</p>
          </div>
          <ProductStatusButtons productId={product.id} status={product.status} />
        </div>
      </header>

      {showImagesFailedNotice && (
        <p role="status" className="bg-secondary/50 rounded-md border p-3 text-sm">
          {failedCount === 1
            ? 'One photo could not be uploaded when this product was created. Add it below.'
            : `${failedCount} photos could not be uploaded when this product was created. Add them below.`}
        </p>
      )}

      <ProductForm
        // Remount when the product row changes — e.g. after a save's
        // router.refresh() — so the uncontrolled inputs re-initialise with
        // the new defaults instead of warning that defaultValue changed.
        key={product.updatedAt.getTime()}
        mode="edit"
        productId={product.id}
        images={images}
        defaults={{
          title: product.title,
          description: product.description,
          price: product.price,
          currency: product.currency,
          stockOnHand: product.stockOnHand,
          weightGrams: product.weightGrams,
          materials: product.materials,
          dimensions: product.dimensions,
        }}
      />
    </div>
  );
}
