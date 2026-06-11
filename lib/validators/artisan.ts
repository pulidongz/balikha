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

// External profile links (T2). https only — these render as outbound links
// on a public page, so plain-http and exotic schemes are rejected outright.
// One schema per field so the error example matches the platform the user
// is actually typing into.
function externalLinkField(example: string) {
  return z
    .string()
    .url(`Enter a full URL, e.g. ${example}`)
    .startsWith('https://', 'Links must start with https://')
    .max(300)
    .optional()
    .nullable();
}

export const artisanProfileUpdateSchema = z.object({
  shopName: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[^\x00-\x1F\x7F]*$/, 'Shop name must not contain control characters'),
  // 5000 since T2: the studio story is multi-paragraph by design.
  bio: z.string().max(5000).optional().nullable(),
  location: z.string().max(120).optional().nullable(),
  policies: z.string().max(5000).optional().nullable(),
  // Craft practice tags ("pottery", "weaving") — small, lowercase-ish labels,
  // capped so the hero stays a description, not a tag cloud. Undefined =
  // not submitted; an empty array clears (the action stores null).
  craftTags: z.array(z.string().min(2).max(30)).max(6).optional(),
  instagram: externalLinkField('https://instagram.com/yourname'),
  facebook: externalLinkField('https://facebook.com/yourpage'),
  tiktok: externalLinkField('https://tiktok.com/@yourname'),
  website: externalLinkField('https://yourstudio.ph'),
});

export const artisanCoverFocusSchema = z.enum(['top', 'center', 'bottom']);

export type ArtisanProfileCreateInput = z.infer<typeof artisanProfileCreateSchema>;
export type ArtisanProfileUpdateInput = z.infer<typeof artisanProfileUpdateSchema>;
export type ArtisanCoverFocus = z.infer<typeof artisanCoverFocusSchema>;
