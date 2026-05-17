'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { deleteAddressAction } from '@/lib/actions/addresses';

interface Address {
  id: string;
  label: string | null;
  recipientName: string;
  phone: string | null;
  line1: string;
  line2: string | null;
  barangay: string | null;
  city: string;
  province: string;
  postalCode: string | null;
  countryCode: string;
  isDefaultShipping: boolean;
  isDefaultBilling: boolean;
}

export function AddressCard({ address }: { address: Address }) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <article className="bg-card flex flex-col gap-3 rounded-md border p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-0.5">
          {address.label && <p className="text-sm font-medium">{address.label}</p>}
          <p className="text-sm font-medium">{address.recipientName}</p>
          {address.phone && <p className="text-muted-foreground text-xs">{address.phone}</p>}
        </div>
        <div className="flex flex-wrap gap-1">
          {address.isDefaultShipping && <Badge variant="secondary">Default shipping</Badge>}
          {address.isDefaultBilling && <Badge variant="secondary">Default billing</Badge>}
        </div>
      </div>

      <address className="text-muted-foreground text-sm not-italic">
        {address.line1}
        {address.line2 && (
          <>
            <br />
            {address.line2}
          </>
        )}
        <br />
        {[address.barangay, address.city, address.province].filter(Boolean).join(', ')}
        {address.postalCode && ` ${address.postalCode}`}
        <br />
        {address.countryCode}
      </address>

      <div className="flex items-center gap-2 pt-1">
        <Link
          href={`/account/addresses/${address.id}/edit`}
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          Edit
        </Link>
        <Button variant="ghost" size="sm" onClick={() => setConfirmOpen(true)}>
          Delete
        </Button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Delete this address?"
        description={`This removes ${
          address.label ? `"${address.label}"` : 'this address'
        } from your account. You cannot undo this.`}
        confirmLabel="Delete address"
        pendingLabel="Deleting…"
        destructive
        onConfirm={() => deleteAddressAction(address.id)}
        onSuccess={() => router.refresh()}
      />
    </article>
  );
}
