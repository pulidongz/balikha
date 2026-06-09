import { z } from 'zod';

// `image` is owned exclusively by the avatar upload/delete server actions
// (mirrors the banner pattern in artisan.ts), so it isn't accepted on the
// profile-update schema.
export const profileUpdateSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(40),
  lastName: z.string().max(40).optional().default(''),
});

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

// Buyer addresses. PH-first defaults but any country can be entered.
// Optional fields use empty-string-as-null preprocessing because HTML
// forms always submit strings — empty input becomes a real "not provided"
// rather than a literal '' that violates non-empty downstream constraints.
const optionalString = z
  .preprocess((v) => (typeof v === 'string' && v.trim() === '' ? null : v), z.string().nullish())
  .transform((v) => v ?? null);

const requiredString = (max: number, label: string) =>
  z.string().min(1, `${label} is required`).max(max, `${label} must be ${max} characters or fewer`);

const countryCodeField = z
  .string()
  .length(2, 'Country code must be 2 letters')
  .transform((v) => v.toUpperCase());

const booleanCheckbox = z
  .preprocess((v) => v === 'on' || v === true || v === 'true', z.boolean())
  .default(false);

export const addressCreateSchema = z.object({
  label: optionalString,
  recipientName: requiredString(120, 'Recipient name'),
  phone: optionalString,
  line1: requiredString(200, 'Address line 1'),
  line2: optionalString,
  barangay: optionalString,
  city: requiredString(100, 'City'),
  province: requiredString(100, 'Province'),
  postalCode: optionalString,
  countryCode: countryCodeField.default('PH'),
  isDefaultShipping: booleanCheckbox,
  isDefaultBilling: booleanCheckbox,
});

export type AddressCreateInput = z.infer<typeof addressCreateSchema>;

// Update reuses the same validation; the `id` is read from the route param
// in the server action, not accepted from the form, so it isn't here.
export const addressUpdateSchema = addressCreateSchema;
export type AddressUpdateInput = z.infer<typeof addressUpdateSchema>;
