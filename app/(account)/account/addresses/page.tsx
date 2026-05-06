import Link from 'next/link';
import { redirect } from 'next/navigation';
import { desc, eq } from 'drizzle-orm';
import { buttonVariants } from '@/components/ui/button';
import { db } from '@/db';
import { userAddresses } from '@/db/schema';
import { getCurrentUser } from '@/lib/auth-helpers';
import { AddressCard } from '@/components/account/address-card';

export const metadata = {
  title: 'Addresses',
};

export default async function AddressesPage() {
  const current = await getCurrentUser();
  if (!current) redirect('/sign-in?next=/account/addresses');

  const list = await db
    .select()
    .from(userAddresses)
    .where(eq(userAddresses.userId, current.id))
    .orderBy(desc(userAddresses.isDefaultShipping), desc(userAddresses.createdAt));

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl">Addresses</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Saved shipping and billing addresses.
          </p>
        </div>
        <Link href="/account/addresses/new" className={buttonVariants()}>
          + Add address
        </Link>
      </header>

      {list.length === 0 ? (
        <div className="bg-card rounded-md border p-8 text-center">
          <p className="text-muted-foreground text-sm">
            No saved addresses yet. Add one to speed up checkout when it ships.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {list.map((address) => (
            <AddressCard key={address.id} address={address} />
          ))}
        </div>
      )}
    </div>
  );
}
