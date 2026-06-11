import { ImageResponse } from 'next/og';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { artisanProfiles, productImages, products } from '@/db/schema';
import { ogPhotoDataUri } from '@/lib/og/photo-data-uri';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Handmade work on Balikha';

// Work share card (T18): the photo carries it; title + studio ride a
// navy band along the bottom.
export default async function WorkOgImage({
  params,
}: {
  params: Promise<{ artisanSlug: string; productSlug: string }>;
}) {
  const { artisanSlug, productSlug } = await params;
  const [row] = await db
    .select({
      productId: products.id,
      title: products.title,
      shopName: artisanProfiles.shopName,
    })
    .from(products)
    .innerJoin(artisanProfiles, eq(artisanProfiles.id, products.artisanProfileId))
    .where(and(eq(artisanProfiles.shopSlug, artisanSlug), eq(products.slug, productSlug)))
    .limit(1);

  let photoData: string | null = null;
  if (row) {
    const [img] = await db
      .select({ url: productImages.url })
      .from(productImages)
      .where(eq(productImages.productId, row.productId))
      .orderBy(asc(productImages.position))
      .limit(1);
    if (img) photoData = await ogPhotoDataUri(img.url);
  }

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#1A2B3A',
      }}
    >
      {photoData ? (
        <img src={photoData} alt="" style={{ width: '100%', flex: 1, objectFit: 'cover' }} />
      ) : (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#EEE9DD',
            fontSize: 48,
            fontWeight: 700,
          }}
        >
          {row?.title ?? 'Balikha'}
        </div>
      )}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '28px 48px',
          color: '#EEE9DD',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', maxWidth: '75%' }}>
          <div
            style={{
              fontSize: 36,
              fontWeight: 700,
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              textOverflow: 'ellipsis',
            }}
          >
            {row?.title ?? 'Handmade work'}
          </div>
          {row?.shopName && <div style={{ fontSize: 24, opacity: 0.75 }}>{row.shopName}</div>}
        </div>
        <div style={{ fontSize: 30, fontWeight: 700 }}>Balikha</div>
      </div>
    </div>,
    size,
  );
}
