import { eq } from 'drizzle-orm';
import { requireSellerProfile } from '@/lib/auth-helpers';
import { db } from '@/db';
import { sellerBlockedBuyers, user } from '@/db/schema';
import { UnblockButton } from '@/components/dashboard/unblock-button';

export const metadata = { title: 'Blocked buyers' };

export default async function BlockedBuyersPage() {
  const profile = await requireSellerProfile();
  const rows = await db
    .select({
      blockedUserId: sellerBlockedBuyers.blockedUserId,
      reason: sellerBlockedBuyers.reason,
      createdAt: sellerBlockedBuyers.createdAt,
      name: user.name,
      email: user.email,
    })
    .from(sellerBlockedBuyers)
    .innerJoin(user, eq(user.id, sellerBlockedBuyers.blockedUserId))
    .where(eq(sellerBlockedBuyers.artisanProfileId, profile.id));

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-10 sm:px-6">
      <header>
        <h1 className="text-xl font-medium">Blocked buyers</h1>
        <p className="text-muted-foreground text-sm">
          These buyers cannot start new conversations or send new messages.
        </p>
      </header>
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">No blocked buyers.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li
              key={r.blockedUserId}
              className="flex items-center justify-between rounded-md border p-3"
            >
              <div>
                <p className="font-medium">{r.name}</p>
                <p className="text-muted-foreground text-xs">{r.email}</p>
              </div>
              <UnblockButton blockedUserId={r.blockedUserId} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
