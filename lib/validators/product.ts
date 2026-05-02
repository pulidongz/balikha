import { z } from 'zod';

// Money is stored and validated as a string to preserve numeric(10,2)
// precision — see lib/format.ts. The regex enforces "digits with up to 2
// decimals", and the refine then asserts the parsed value is positive.
const priceRegex = /^\d+(\.\d{1,2})?$/;
const priceField = z
  .string()
  .regex(priceRegex, 'Price must be a number with up to 2 decimals')
  .refine((v) => Number(v) > 0, 'Price must be greater than zero');

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
    .max(200, 'Title must be 200 characters or fewer'),
  description: z.string().max(5000).optional().nullable(),
  price: priceField,
  currency: z.string().length(3).default('PHP'),
  stockOnHand: z.coerce.number().int().nonnegative().default(0),
  weightGrams: z.coerce.number().int().nonnegative().optional().nullable(),
  materials: materialsField,
  dimensions: dimensionsField,
});

export const productUpdateSchema = z.object({
  title: z.string().min(2).max(200),
  description: z.string().max(5000).optional().nullable(),
  price: priceField,
  currency: z.string().length(3).default('PHP'),
  stockOnHand: z.coerce.number().int().nonnegative().default(0),
  weightGrams: z.coerce.number().int().nonnegative().optional().nullable(),
  materials: materialsField,
  dimensions: dimensionsField,
});

export const productStatusSchema = z.enum(['draft', 'published', 'sold_out', 'archived']);

// Presigned-upload flow: client requests a URL, uploads directly to S3,
// then confirms with the dimensions it read client-side. The 10MB cap is
// enforced both here (early rejection) and via Content-Length on the
// presigned URL (S3 enforces it server-side).
export const imageUploadRequestSchema = z.object({
  productId: z.string().uuid(),
  filename: z.string().min(1).max(255),
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/avif']),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(10 * 1024 * 1024),
});

export const imageUploadConfirmSchema = z.object({
  productId: z.string().uuid(),
  key: z.string().min(1).max(512),
  width: z.number().int().positive().max(20000),
  height: z.number().int().positive().max(20000),
  altText: z.string().max(200).optional(),
});

export type ProductCreateInput = z.infer<typeof productCreateSchema>;
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;
export type ProductStatus = z.infer<typeof productStatusSchema>;
export type ImageUploadRequest = z.infer<typeof imageUploadRequestSchema>;
export type ImageUploadConfirm = z.infer<typeof imageUploadConfirmSchema>;
