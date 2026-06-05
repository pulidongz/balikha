import { db } from '@/db';
import type { Tx } from '@/db';
import { adminActions } from '@/db/schema';
import type { adminActionType } from '@/db/schema';

// Infer the union type directly from the Drizzle enum so there is no
// duplication and any schema change is caught by TypeScript immediately.
type AdminActionType = (typeof adminActionType.enumValues)[number];

type RecordAdminActionInput = {
  actorUserId: string | null;
  action: AdminActionType;
  targetUserId: string | null;
  reason?: string;
  metadata?: Record<string, unknown>;
};

/**
 * Append-only audit log writer.  Call inside the same Drizzle transaction as
 * the mutation so the audit row is atomically linked to the action.
 *
 * - `actorUserId` / `targetUserId` may be null (nullable SET NULL FK) so that
 *   deleting a user preserves the immutable log (Issue 3).
 * - `action` is typed to the `adminActionType` pg enum union.
 */
export async function recordAdminAction(input: RecordAdminActionInput, tx?: Tx): Promise<void> {
  const executor = tx ?? db;

  await executor.insert(adminActions).values({
    id: crypto.randomUUID(),
    actorUserId: input.actorUserId,
    action: input.action,
    targetUserId: input.targetUserId,
    reason: input.reason ?? null,
    metadataJson: input.metadata ?? null,
  });
}

// Re-export the type so callers that only import from this module can
// reference it without importing from the schema directly.
export type { AdminActionType };
