import type { InferSelectModel } from 'drizzle-orm';
import type { orderEventType, orderStatus, orders } from '@/db/schema';

// One canonical place to derive these from the schema. Doing it via
// InferSelectModel + the pgEnum's enumValues tuple means renames or new
// statuses propagate automatically — no second source of truth to keep
// in sync.

export type Order = InferSelectModel<typeof orders>;

export type OrderStatus = (typeof orderStatus.enumValues)[number];

export type OrderEventType = (typeof orderEventType.enumValues)[number];

// Discriminator for who triggered a transition. 'system' is reserved
// for the Phase 6 timeout tick; transitionOrder skips the authorization
// check when actorRole === 'system'.
export type ActorRole = 'buyer' | 'seller' | 'admin' | 'system';
