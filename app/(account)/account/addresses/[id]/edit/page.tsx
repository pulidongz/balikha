import { notFound, redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { userAddresses } from '@/db/schema';
import { getCurrentUser } from '@/lib/auth-helpers';
import { AddressForm } from '@/components/account/address-form';

export const metadata = {
  title: 'Edit address · Balikha',
};

export default async function EditAddressPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const current = await getCurrentUser();
  if (!current) redirect(`/sign-in?next=/account/addresses/${id}/edit`);

  // Single read constrained by id + userId — IDOR-safe. Another buyer's
  // address ID returns 404 (notFound), not 403 — privacy wins over the
  // pedantically correct status.
  const [address] = await db
    .select()
    .from(userAddresses)
    .where(and(eq(userAddresses.id, id), eq(userAddresses.userId, current.id)))
    .limit(1);
  if (!address) notFound();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-3xl">Edit address</h1>
      </header>

      <AddressForm
        mode="edit"
        addressId={address.id}
        defaults={{
          label: address.label,
          recipientName: address.recipientName,
          phone: address.phone,
          line1: address.line1,
          line2: address.line2,
          barangay: address.barangay,
          city: address.city,
          province: address.province,
          postalCode: address.postalCode,
          countryCode: address.countryCode,
          isDefaultShipping: address.isDefaultShipping,
          isDefaultBilling: address.isDefaultBilling,
        }}
      />
    </div>
  );
}
