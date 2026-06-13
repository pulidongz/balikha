// Guards that the admin_action_type enum keeps a value for every admin action
// that is supposed to be audited. This is a DB-free check (it reads the
// Drizzle enum union, not the database), so it runs anywhere and fails fast in
// CI if someone adds a new audited admin action without an enum value — the
// exact regression that left disputes/seller/comment/editorial actions out of
// the audit log before this ticket. Run: npm run test:admin-audit-coverage
import { adminActionType } from '@/db/schema';

// The full set of admin actions that MUST be representable in the audit log.
// Keep in sync with recordAdminAction() call sites across lib/actions/*.
const REQUIRED = [
  'suspend',
  'unsuspend',
  'ban',
  'unban',
  'promote_admin',
  'demote_admin',
  'remove_product',
  'flag_product',
  'reinstate_product',
  'resolve_dispute',
  'force_cancel_order',
  'force_complete_order',
  'approve_seller',
  'reject_seller',
  'resolve_comment_report',
  'update_editorial_feature',
] as const;

const have = new Set<string>(adminActionType.enumValues);
const missing = REQUIRED.filter((value) => !have.has(value));

if (missing.length > 0) {
  console.error('✗ admin_action_type is missing audit values:', missing.join(', '));
  process.exit(1);
}

process.stdout.write(
  `✓ admin audit coverage: all ${REQUIRED.length} action types present in the enum\n`,
);
