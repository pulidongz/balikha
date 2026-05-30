import { z } from 'zod';
import { idempotencyKeyField } from './_shared';

// shopSlug is server-generated from shopName via lib/slug.ts uniqueSlug —
// never accepted from clients. bannerImageUrl is owned exclusively by the
// banner upload/delete server actions, so it isn't in the update schema.
export const artisanProfileCreateSchema = z.object({
  shopName: z
    .string()
    .min(2, 'Shop name must be at least 2 characters')
    .max(80, 'Shop name must be 80 characters or fewer')
    .regex(/^[^\x00-\x1F\x7F]*$/, 'Shop name must not contain control characters'),
  idempotencyKey: idempotencyKeyField,
});

export const artisanProfileUpdateSchema = z.object({
  shopName: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[^\x00-\x1F\x7F]*$/, 'Shop name must not contain control characters'),
  bio: z.string().max(2000).optional().nullable(),
  location: z.string().max(120).optional().nullable(),
  policies: z.string().max(5000).optional().nullable(),
});

export type ArtisanProfileCreateInput = z.infer<typeof artisanProfileCreateSchema>;
export type ArtisanProfileUpdateInput = z.infer<typeof artisanProfileUpdateSchema>;
