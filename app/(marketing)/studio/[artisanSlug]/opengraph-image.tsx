import { ImageResponse } from 'next/og';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { artisanProfiles } from '@/db/schema';
import { ogPhotoDataUri } from '@/lib/og/photo-data-uri';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Studio on Balikha';

// Studio share card (T18): cover photo + name + Balikha mark, in the
// brand navy/sand. This is what an Instagram-bio link unfurls into.
export default async function StudioOgImage({
  params,
}: {
  params: Promise<{ artisanSlug: string }>;
}) {
  const { artisanSlug } = await params;
  const [profile] = await db
    .select({
      shopName: artisanProfiles.shopName,
      location: artisanProfiles.location,
      bannerImageUrl: artisanProfiles.bannerImageUrl,
      profilePhotoUrl: artisanProfiles.profilePhotoUrl,
    })
    .from(artisanProfiles)
    .where(eq(artisanProfiles.shopSlug, artisanSlug))
    .limit(1);

  const cover = profile?.bannerImageUrl ?? profile?.profilePhotoUrl ?? null;
  const coverData = cover ? await ogPhotoDataUri(cover) : null;

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        backgroundColor: '#1A2B3A',
      }}
    >
      {coverData && (
        <img src={coverData} alt="" style={{ width: '55%', height: '100%', objectFit: 'cover' }} />
      )}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          flex: 1,
          padding: '56px',
          color: '#EEE9DD',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ fontSize: 56, fontWeight: 700, lineHeight: 1.1 }}>
            {profile?.shopName ?? 'Studio'}
          </div>
          {profile?.location && (
            <div style={{ fontSize: 28, opacity: 0.75 }}>{profile.location}</div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
          <div style={{ fontSize: 34, fontWeight: 700 }}>Balikha</div>
          <div style={{ fontSize: 22, opacity: 0.7 }}>handmade, from the Philippines</div>
        </div>
      </div>
    </div>,
    size,
  );
}
