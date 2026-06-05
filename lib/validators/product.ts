import { z } from 'zod';

// Money is stored and validated as a string to preserve numeric(10,2)
// precision — see lib/format.ts. The regex enforces "digits with up to 2
// decimals", and the refine then asserts the parsed value is positive.
const priceRegex = /^\d+(\.\d{1,2})?$/;
// The product form formats the price for display with thousands separators
// ("1,200.00"). Strip commas before the regex/refine so the stored value is
// always a clean numeric string.
const priceField = z
  .string()
  .transform((v) => v.replace(/,/g, ''))
  .pipe(
    z
      .string()
      .regex(priceRegex, 'Price must be a number with up to 2 decimals')
      .refine((v) => Number(v) > 0, 'Price must be greater than zero'),
  );

const dimensionsField = z
  .object({
    width: z.coerce.number().positive().optional(),
    height: z.coerce.number().positive().optional(),
    depth: z.coerce.number().positive().optional(),
    unit: z.enum(['cm', 'in']).optional(),
  })
  .optional()
  .nullable();

const materialsField = z.array(z.string().min(1).max(40)).max(20).optional().nullable();

// catalogId comes from the URL or trusted server context; everything else
// is the form payload. id, slug, artisanProfileId are server-derived.
export const productCreateSchema = z.object({
  catalogId: z.string().uuid(),
  title: z
    .string()
    .min(2, 'Title must be at least 2 characters')
    .max(200, 'Title must be 200 characters or fewer')
    .regex(/^[^\x00-\x1F\x7F]*$/, 'Title must not contain control characters'),
  description: z.string().max(5000).optional().nullable(),
  price: priceField,
  currency: z.string().length(3).default('PHP'),
  stockOnHand: z.coerce.number().int().nonnegative().default(0),
  weightGrams: z.coerce.number().int().nonnegative().optional().nullable(),
  materials: materialsField,
  dimensions: dimensionsField,
});

export const productUpdateSchema = z.object({
  title: z
    .string()
    .min(2)
    .max(200)
    .regex(/^[^\x00-\x1F\x7F]*$/, 'Title must not contain control characters'),
  description: z.string().max(5000).optional().nullable(),
  price: priceField,
  currency: z.string().length(3).default('PHP'),
  stockOnHand: z.coerce.number().int().nonnegative().default(0),
  weightGrams: z.coerce.number().int().nonnegative().optional().nullable(),
  materials: materialsField,
  dimensions: dimensionsField,
});

export const productStatusSchema = z.enum(['draft', 'published', 'sold_out', 'archived']);

export type ProductCreateInput = z.infer<typeof productCreateSchema>;
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;
export type ProductStatus = z.infer<typeof productStatusSchema>;
