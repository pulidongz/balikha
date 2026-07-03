import { revalidatePath } from 'next/cache';
import { db, type Tx } from '@/db';
import { recordAdminAction, type AdminActionType } from '@/lib/admin/audit';
import type { AdminActionLogger } from '@/lib/admin/auth-call';
import { err, ok, type Result } from '@/lib/result';

export type RecordAdminMutationInput = {
  log: AdminActionLogger;
  adminId: string;
  userId: string;
  action: AdminActionType;
  reason?: string;
  metadata?: Record<string, unknown>;
  /**
   * Listing-visibility operation (hideSellerListings / restoreSellerListings)
   * to run atomically with the audit write. When omitted the audit row is
   * written without a wrapping transaction, matching promote/demote today.
   */
  listingOp?: (userId: string, tx: Tx) => Promise<unknown>;
  /** log.error message on failure, e.g. 'post-suspend transaction failed'. */
  failureLogMessage: string;
  /** Builds the user-facing error; the copy differs per action. */
  failureErrMessage: (message: string) => string;
  /** log.info message on success, e.g. 'User suspended'. */
  successLogMessage: string;
  /** Extra fields merged into the success log line, e.g. { durationDays }. */
  successLogFields?: Record<string, unknown>;
};

/**
 * Persists the audit trail (plus any listing-visibility change) for an admin
 * user-status mutation, then logs success and revalidates the admin user
 * pages. Call only after the Better Auth API call has succeeded — a failure
 * here means the auth-side change already happened, so the error copy must
 * say so honestly.
 */
export async function recordAdminMutation(input: RecordAdminMutationInput): Promise<Result<null>> {
  const { listingOp } = input;
  const auditInput = {
    actorUserId: input.adminId,
    action: input.action,
    targetUserId: input.userId,
    reason: input.reason,
    metadata: input.metadata,
  };

  try {
    if (listingOp) {
      await db.transaction(async (tx) => {
        await listingOp(input.userId, tx);
        await recordAdminAction(auditInput, tx);
      });
    } else {
      await recordAdminAction(auditInput);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    input.log.error(
      { adminId: input.adminId, targetUserId: input.userId, error: message },
      input.failureLogMessage,
    );
    return err(input.failureErrMessage(message));
  }

  input.log.info(
    { adminId: input.adminId, targetUserId: input.userId, ...input.successLogFields },
    input.successLogMessage,
  );

  revalidatePath('/admin/users');
  revalidatePath(`/admin/users/${input.userId}`);

  return ok(null);
}
