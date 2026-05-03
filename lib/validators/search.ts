import { z } from 'zod';

// SearchRequest input. Caps + clamps mirror the query layer's expectations:
// - q has a hard upper bound to defuse pathological inputs (the tsquery
//   sanitizer would still strip them, but we'd rather reject early).
// - materials is capped at 10; more than that is OR-noise, not a useful
//   filter, and would expand the GIN scan needlessly.
// - limit is coerced from string (URL params arrive as strings) and clamped
//   in the query layer too — this just rejects nonsense up front.
//
// `z.coerce.*` for numeric/boolean fields lets us point this at raw URL
// search params without per-field manual parsing.
export const searchRequestSchema = z.object({
  q: z.string().min(1).max(200),
  materials: z.array(z.string().min(1).max(40)).max(10).optional(),
  priceMin: z.coerce.number().nonnegative().optional(),
  priceMax: z.coerce.number().nonnegative().optional(),
  inStockOnly: z.coerce.boolean().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(60).optional(),
});

export type SearchRequestInput = z.infer<typeof searchRequestSchema>;
