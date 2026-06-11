import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth-helpers';
import { safeNextOr } from '@/lib/safe-next';
import { AddressForm } from '@/components/account/address-form';

export const metadata = {
  title: 'New address',
};

export default async function NewAddressPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const current = await getCurrentUser();
  // The signed-out redirect deliberately drops `next`: safeNextOr rejects
  // `%`, so a nested-encoded next would not survive sign-in validation.
  if (!current) redirect('/sign-in?next=/account/addresses/new');

  const { next } = await searchParams;
  // Where to send the user after saving. From the order dialog this is
  // the product page with ?order=1 so the dialog reopens; reached
  // directly it stays the addresses list.
  const returnTo = safeNextOr(next ?? null, '/account/addresses');

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-3xl">Add an address</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Saved here for faster checkout once that lands.
        </p>
      </header>

      <AddressForm mode="create" returnTo={returnTo} />
    </div>
  );
}
