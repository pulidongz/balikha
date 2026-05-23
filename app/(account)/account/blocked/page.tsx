import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { artisanProfiles, buyerBlockedSellers } from '@/db/schema';
import { getCurrentUser } from '@/lib/auth-helpers';
import { UnblockSellerButton } from '@/components/account/unblock-seller-button';

export const metadata = { title: 'Blocked makers' };

export default async function BlockedMakersPage() {
  const current = await getCurrentUser();
  if (!current) redirect('/sign-in?next=/account/blocked');

  const rows = await db
    .select({
      artisanProfileId: buyerBlockedSellers.blockedArtisanProfileId,
      reason: buyerBlockedSellers.reason,
      createdAt: buyerBlockedSellers.createdAt,
      shopName: artisanProfiles.shopName,
      shopSlug: artisanProfiles.shopSlug,
    })
    .from(buyerBlockedSellers)
    .innerJoin(artisanProfiles, eq(artisanProfiles.id, buyerBlockedSellers.blockedArtisanProfileId))
    .where(eq(buyerBlockedSellers.buyerUserId, current.id));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-2xl tracking-tight">Blocked makers</h1>
        <p className="text-muted-foreground text-sm">
          These makers cannot send you new messages on pre-purchase threads. Existing orders between
          you continue normally.
        </p>
      </header>
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">No blocked makers.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li
              key={r.artisanProfileId}
              className="flex items-center justify-between rounded-md border p-3"
            >
              <div>
                <p className="font-medium">{r.shopName}</p>
                <p className="text-muted-foreground text-xs">@{r.shopSlug}</p>
              </div>
              <UnblockSellerButton artisanProfileId={r.artisanProfileId} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
