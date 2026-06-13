// Shared presentation for admin audit actions. Used by both the full audit
// log page (app/(admin)/admin/audit-log/page.tsx) and the overview's
// recent-activity card so the pill colours and labels never drift apart.

// Tailwind pill classes per admin_action_type value. A value missing here
// falls back to neutral grey at the call site.
export const ADMIN_ACTION_PILL: Record<string, string> = {
  suspend: 'bg-amber-100 text-amber-800',
  unsuspend: 'bg-green-100 text-green-800',
  ban: 'bg-red-100 text-red-800',
  unban: 'bg-green-100 text-green-800',
  promote_admin: 'bg-purple-100 text-purple-800',
  demote_admin: 'bg-gray-100 text-gray-700',
  remove_product: 'bg-red-100 text-red-700',
  flag_product: 'bg-amber-100 text-amber-800',
  reinstate_product: 'bg-green-100 text-green-800',
  resolve_dispute: 'bg-blue-100 text-blue-800',
  force_cancel_order: 'bg-red-100 text-red-700',
  force_complete_order: 'bg-green-100 text-green-800',
  approve_seller: 'bg-green-100 text-green-800',
  reject_seller: 'bg-red-100 text-red-700',
  resolve_comment_report: 'bg-blue-100 text-blue-800',
  update_editorial_feature: 'bg-purple-100 text-purple-800',
};

// Human label for an action value: underscores → spaces.
export function adminActionLabel(action: string): string {
  return action.replace(/_/g, ' ');
}

// Typed reads of the jsonb metadata column. The column is `unknown` at the
// type level; these narrow without a forbidden `as any` / `as unknown as T`.
export function metadataOrderId(meta: unknown): string | null {
  if (meta && typeof meta === 'object' && 'orderId' in meta) {
    const value = (meta as Record<string, unknown>).orderId;
    return typeof value === 'string' ? value : null;
  }
  return null;
}

export function metadataReference(meta: unknown): string | null {
  if (meta && typeof meta === 'object' && 'reference' in meta) {
    const value = (meta as Record<string, unknown>).reference;
    return typeof value === 'string' ? value : null;
  }
  return null;
}
