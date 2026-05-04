import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth-helpers';
import { AddressForm } from '@/components/account/address-form';

export const metadata = {
  title: 'New address · Balikha',
};

export default async function NewAddressPage() {
  const current = await getCurrentUser();
  if (!current) redirect('/sign-in?next=/account/addresses/new');

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-3xl">Add an address</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Saved here for faster checkout once that lands.
        </p>
      </header>

      <AddressForm mode="create" />
    </div>
  );
}
