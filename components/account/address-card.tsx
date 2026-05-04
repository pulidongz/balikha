'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    setError(null);
    if (!confirm(`Delete address${address.label ? ` "${address.label}"` : ''}?`)) return;
    startTransition(async () => {
      const result = await deleteAddressAction(address.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

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

      {error && (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2 pt-1">
        <Link
          href={`/account/addresses/${address.id}/edit`}
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          Edit
        </Link>
        <Button variant="ghost" size="sm" onClick={handleDelete} disabled={isPending}>
          {isPending ? 'Deleting…' : 'Delete'}
        </Button>
      </div>
    </article>
  );
}
