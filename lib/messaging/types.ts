import type { InferSelectModel } from 'drizzle-orm';
import type { messageThreads, messages } from '@/db/schema';

export type MessageThread = InferSelectModel<typeof messageThreads>;
export type Message = InferSelectModel<typeof messages>;
export type MessageSenderRole = 'buyer' | 'seller';

// Computed live from the related order's status. A thread is writable iff:
//   - it has no orderId (pre-purchase), OR
//   - the order is non-terminal, OR
//   - the order is 'disputed' (dispute reopens the conversation).
// `kind === 'closed'` means new messages are rejected at the action
// layer; existing messages stay visible.
export type ThreadWriteState =
  | { kind: 'open'; reason: 'pre_purchase' | 'order_active' | 'order_disputed' }
  | { kind: 'closed'; reason: 'order_terminal' };
