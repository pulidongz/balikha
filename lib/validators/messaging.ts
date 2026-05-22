import { z } from 'zod';

// First message creates the pre-purchase thread. idempotencyKey is
// REQUIRED: the only caller (AskTheMakerButton, §6.10) always sends a
// fresh crypto.randomUUID(), and createPrePurchaseThread depends on it
// for its advisory lock + idempotency cache (§4.6.a). A same-key retry
// (a transport-level resend of one submit) returns the cached
// threadId; two genuinely distinct submits get distinct keys and are
// deduped by the partial unique index
// message_threads_active_pre_purchase_idx.
export const createPrePurchaseThreadSchema = z.object({
  productId: z.string().uuid(),
  initialMessage: z.string().min(1).max(2000),
  idempotencyKey: z.string().uuid(),
});

export type CreatePrePurchaseThreadInput = z.infer<typeof createPrePurchaseThreadSchema>;

export const sendMessageSchema = z.object({
  threadId: z.string().uuid(),
  body: z.string().min(1).max(2000),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const markThreadReadSchema = z.object({
  threadId: z.string().uuid(),
});

export type MarkThreadReadInput = z.infer<typeof markThreadReadSchema>;

export const blockBuyerSchema = z.object({
  blockedUserId: z.string().min(1),
  reason: z.string().max(500).optional(),
});

export type BlockBuyerInput = z.infer<typeof blockBuyerSchema>;

export const unblockBuyerSchema = z.object({
  blockedUserId: z.string().min(1),
});

export type UnblockBuyerInput = z.infer<typeof unblockBuyerSchema>;

export const reportMessageSchema = z.object({
  messageId: z.string().uuid(),
  reason: z.string().max(2000).optional(),
});

export type ReportMessageInput = z.infer<typeof reportMessageSchema>;
