'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createAddressAction, updateAddressAction } from '@/lib/actions/addresses';

type AddressDefaults = {
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
};

const EMPTY_DEFAULTS: AddressDefaults = {
  label: null,
  recipientName: '',
  phone: null,
  line1: '',
  line2: null,
  barangay: null,
  city: '',
  province: '',
  postalCode: null,
  countryCode: 'PH',
  isDefaultShipping: false,
  isDefaultBilling: false,
};

type Props =
  | { mode: 'create'; addressId?: never; defaults?: AddressDefaults }
  | { mode: 'edit'; addressId: string; defaults: AddressDefaults };

export function AddressForm(props: Props) {
  const router = useRouter();
  const defaults = props.defaults ?? EMPTY_DEFAULTS;
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  function fieldError(name: string): string | undefined {
    return fieldErrors[name]?.[0];
  }

  return (
    <form
      noValidate
      className="space-y-5"
      action={(formData) => {
        setError(null);
        setFieldErrors({});
        startTransition(async () => {
          const result =
            props.mode === 'create'
              ? await createAddressAction(formData)
              : await updateAddressAction(props.addressId, formData);
          if (!result.ok) {
            setError(result.error);
            setFieldErrors(result.fieldErrors ?? {});
            return;
          }
          router.push('/account/addresses');
          router.refresh();
        });
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="addr-label">Label (optional)</Label>
          <Input
            id="addr-label"
            name="label"
            defaultValue={defaults.label ?? ''}
            placeholder="e.g. Home, Mom's place"
            maxLength={40}
            aria-invalid={fieldError('label') ? true : undefined}
          />
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="addr-recipient">Recipient name</Label>
          <Input
            id="addr-recipient"
            name="recipientName"
            defaultValue={defaults.recipientName}
            required
            maxLength={120}
            aria-invalid={fieldError('recipientName') ? true : undefined}
          />
          {fieldError('recipientName') && (
            <p className="text-destructive text-xs">{fieldError('recipientName')}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="addr-phone">Phone (optional)</Label>
          <Input
            id="addr-phone"
            name="phone"
            type="tel"
            defaultValue={defaults.phone ?? ''}
            maxLength={40}
            aria-invalid={fieldError('phone') ? true : undefined}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="addr-country">Country code</Label>
          <Input
            id="addr-country"
            name="countryCode"
            defaultValue={defaults.countryCode}
            required
            maxLength={2}
            minLength={2}
            aria-invalid={fieldError('countryCode') ? true : undefined}
          />
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="addr-line1">Address line 1</Label>
          <Input
            id="addr-line1"
            name="line1"
            defaultValue={defaults.line1}
            required
            maxLength={200}
            aria-invalid={fieldError('line1') ? true : undefined}
          />
          {fieldError('line1') && <p className="text-destructive text-xs">{fieldError('line1')}</p>}
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="addr-line2">Address line 2 (optional)</Label>
          <Input id="addr-line2" name="line2" defaultValue={defaults.line2 ?? ''} maxLength={200} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="addr-barangay">Barangay (optional)</Label>
          <Input
            id="addr-barangay"
            name="barangay"
            defaultValue={defaults.barangay ?? ''}
            maxLength={100}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="addr-postal">Postal code (optional)</Label>
          <Input
            id="addr-postal"
            name="postalCode"
            defaultValue={defaults.postalCode ?? ''}
            maxLength={20}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="addr-city">City</Label>
          <Input
            id="addr-city"
            name="city"
            defaultValue={defaults.city}
            required
            maxLength={100}
            aria-invalid={fieldError('city') ? true : undefined}
          />
          {fieldError('city') && <p className="text-destructive text-xs">{fieldError('city')}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="addr-province">Province</Label>
          <Input
            id="addr-province"
            name="province"
            defaultValue={defaults.province}
            required
            maxLength={100}
            aria-invalid={fieldError('province') ? true : undefined}
          />
          {fieldError('province') && (
            <p className="text-destructive text-xs">{fieldError('province')}</p>
          )}
        </div>

        <div className="flex items-center gap-2 sm:col-span-2">
          <input
            id="addr-default-shipping"
            name="isDefaultShipping"
            type="checkbox"
            defaultChecked={defaults.isDefaultShipping}
            className="border-input h-4 w-4 rounded border"
          />
          <Label htmlFor="addr-default-shipping" className="font-normal">
            Use as default shipping address
          </Label>
        </div>

        <div className="flex items-center gap-2 sm:col-span-2">
          <input
            id="addr-default-billing"
            name="isDefaultBilling"
            type="checkbox"
            defaultChecked={defaults.isDefaultBilling}
            className="border-input h-4 w-4 rounded border"
          />
          <Label htmlFor="addr-default-billing" className="font-normal">
            Use as default billing address
          </Label>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button type="submit" size="lg" disabled={isPending}>
          {isPending ? 'Saving…' : props.mode === 'create' ? 'Add address' : 'Save changes'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={isPending}
          onClick={() => router.push('/account/addresses')}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
