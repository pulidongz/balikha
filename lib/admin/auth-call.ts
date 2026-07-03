import { err, ok, type Result } from '@/lib/result';

/**
 * Minimal logging surface the admin user-status helpers need. Structurally
 * satisfied by the pino child from getRequestLogger(), and implementable by
 * a plain object in DB-free check scripts.
 */
export type AdminActionLogger = {
  error: (fields: Record<string, unknown>, message: string) => void;
  info: (fields: Record<string, unknown>, message: string) => void;
};

export type AdminAuthCallContext = {
  log: AdminActionLogger;
  adminId: string;
  targetUserId: string;
  /** log.error message, e.g. 'banUser (suspend) failed'. */
  failureLogMessage: string;
  /** User-facing prefix; the returned error is `${failureErrPrefix}: ${message}`. */
  failureErrPrefix: string;
};

/**
 * Runs a Better Auth admin API call and converts a thrown error into a
 * Result. Kept free of db/next imports so DB-free check scripts can load it;
 * kept out of lib/actions/users.ts because that file's 'use server' directive
 * would expose any export as a public endpoint.
 */
export async function runAdminAuthCall(
  call: () => Promise<unknown>,
  ctx: AdminAuthCallContext,
): Promise<Result<null>> {
  try {
    await call();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    ctx.log.error(
      { adminId: ctx.adminId, targetUserId: ctx.targetUserId, error: message },
      ctx.failureLogMessage,
    );
    return err(`${ctx.failureErrPrefix}: ${message}`);
  }
  return ok(null);
}
