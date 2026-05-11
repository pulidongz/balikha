import { z } from 'zod';

// Input shape for `placeOrder`. The idempotencyKey is client-generated
// (UUID via crypto.randomUUID()) and lets the server dedupe rapid
// double-submits. Note that the server pairs this with a transaction-
// scoped Postgres advisory lock — the wrapper alone has a documented race
// window (lib/idempotency.ts:30) that's benign for naturally-idempotent
// actions but creates duplicate orders without the lock when the action
// has stock side effects.
export const orderPlaceSchema = z.object({
  productId: z.string().uuid(),
  shippingAddressId: z.string().uuid(),
  notesFromBuyer: z.string().max(2000).optional(),
  idempotencyKey: z.string().uuid().optional(),
});

export type OrderPlaceInput = z.infer<typeof orderPlaceSchema>;
