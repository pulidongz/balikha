import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { catalogs, productImages, products } from '@/db/schema';
import { requireSellerProfile } from '@/lib/auth-helpers';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ProductForm } from '@/components/dashboard/product-form';
import { ProductStatusButtons } from '@/components/dashboard/product-status-buttons';
import { ProductImageUploader } from '@/components/dashboard/product-image-uploader';
import { ProductImageList } from '@/components/dashboard/product-image-list';

export const metadata = {
  title: 'Edit product',
};

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ catalogSlug: string; productSlug: string }>;
}) {
  const { catalogSlug, productSlug } = await params;
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
            <h1 className="text-2xl font-semibold tracking-tight">{product.title}</h1>
            <p className="text-muted-foreground text-sm">/{product.slug}</p>
          </div>
          <ProductStatusButtons productId={product.id} status={product.status} />
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Product details</CardTitle>
          <CardDescription>Slug is locked once created.</CardDescription>
        </CardHeader>
        <CardContent>
          <ProductForm
            mode="edit"
            productId={product.id}
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Images</CardTitle>
          <CardDescription>
            The first image is used as the social-share preview on public pages.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <ProductImageList images={images} />
          <ProductImageUploader productId={product.id} />
        </CardContent>
      </Card>
    </div>
  );
}
