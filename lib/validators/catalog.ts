import { z } from 'zod';

// slug, status, artisanProfileId, timestamps are all server-derived.
// On create: status defaults to 'draft', slug from title via uniqueSlug.
// On update: status changes go through the dedicated setCatalogStatusAction.
export const catalogCreateSchema = z.object({
  title: z
    .string()
    .min(2, 'Title must be at least 2 characters')
    .max(120, 'Title must be 120 characters or fewer'),
  description: z.string().max(2000).optional().nullable(),
});

const timestampField = z
  .union([z.coerce.date(), z.literal('').transform(() => null), z.null()])
  .optional()
  .nullable();

export const catalogUpdateSchema = z.object({
  title: z.string().min(2).max(120),
  description: z.string().max(2000).optional().nullable(),
  releaseAt: timestampField,
  closesAt: timestampField,
  // Checkbox: arrives as 'on' when ticked, absent (undefined) otherwise.
  isLimitedEdition: z.preprocess((v) => v === 'on' || v === true, z.boolean()),
});

export const catalogStatusSchema = z.enum(['draft', 'published', 'archived']);

export type CatalogCreateInput = z.infer<typeof catalogCreateSchema>;
export type CatalogUpdateInput = z.infer<typeof catalogUpdateSchema>;
export type CatalogStatus = z.infer<typeof catalogStatusSchema>;
