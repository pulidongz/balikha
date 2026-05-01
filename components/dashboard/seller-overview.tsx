import Link from 'next/link';
import type { artisanProfiles } from '@/db/schema';
import type { InferSelectModel } from 'drizzle-orm';

type ArtisanProfile = InferSelectModel<typeof artisanProfiles>;

export function SellerOverview({ profile }: { profile: ArtisanProfile }) {
  return (
    <section className="space-y-4">
      <div className="rounded-lg border p-6">
        <h2 className="font-medium">{profile.shopName}</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Public URL:{' '}
          <Link
            href={`/shop/${profile.shopSlug}`}
            className="text-foreground underline-offset-4 hover:underline"
          >
            /shop/{profile.shopSlug}
          </Link>
        </p>
      </div>

      <div className="rounded-lg border p-6">
        <h3 className="font-medium">Catalogs &amp; products</h3>
        <p className="text-muted-foreground mt-2 text-sm">
          Catalog and product management arrive in Phase 5 of balikha-plan.md.
        </p>
      </div>
    </section>
  );
}
