import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert, finish, section } from './lib/check-harness';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Balikha's email-verification posture is PER-ACTION gating, enforced
// EXHAUSTIVELY here. Every network-callable server action (every exported
// `async function` in a `'use server'` file under lib/actions/) must be listed
// below as GATED (its body must call assertVerifiedEmail) or UNGATED
// (deliberately not gated — reason recorded in the grouping comments). A new
// action classified in neither list fails this check, so the posture cannot
// silently rot as the action layer grows. Byte-hosting upload route handlers
// are covered as explicit GATED entries too.
//
// This committed list IS the audit's decision record (issue #132).
//
// LIMITS (this is a tripwire, not a proof): the GATED check is a per-function
// PRESENCE check, comment-aware, requiring an assigned `= assertVerifiedEmail(`
// call (a bare discarded call does not satisfy it). It does NOT prove every
// branch is gated — `fileDispute`, `setProductStatusAction`, and
// `setProductsStatusAction` gate one branch by design (see their inline
// rationale). Nor is the scanned region a precise AST body: it runs to the next
// `export async function`, so a private helper between two exports is absorbed
// into the preceding action's slice. Both are acceptable for a deletion
// tripwire; branch placement and precise scope are reviewed by humans.

type Entry = { file: string; action: string };

// Must call assertVerifiedEmail: create public content, host image bytes, or
// move commerce.
const GATED: Entry[] = [
  { file: 'lib/actions/artisan.ts', action: 'becomeArtisanAction' },
  { file: 'lib/actions/artisan.ts', action: 'updateArtisanProfileAction' },
  { file: 'lib/actions/artisan.ts', action: 'uploadArtisanProfilePhotoAction' },
  { file: 'lib/actions/artisan.ts', action: 'uploadArtisanBannerAction' },
  { file: 'lib/actions/catalog.ts', action: 'createCatalogAction' },
  { file: 'lib/actions/catalog.ts', action: 'updateCatalogAction' },
  { file: 'lib/actions/catalog.ts', action: 'setCatalogStatusAction' },
  { file: 'lib/actions/comments.ts', action: 'postWorkCommentAction' },
  { file: 'lib/actions/comments.ts', action: 'reportWorkCommentAction' },
  { file: 'lib/actions/feedback.ts', action: 'submitFeedbackAction' },
  { file: 'lib/actions/messaging.ts', action: 'createPrePurchaseThread' },
  { file: 'lib/actions/messaging.ts', action: 'sendMessage' },
  { file: 'lib/actions/orders.ts', action: 'placeOrder' },
  { file: 'lib/actions/orders.ts', action: 'cancelAsBuyer' },
  { file: 'lib/actions/orders.ts', action: 'markReceived' },
  // fileDispute gates the BUYER branch only (see `// gate buyers only` at the
  // call site) — a seller can always raise a grievance even if unverified, same
  // logic as the declineOrder/cancelAsSeller exits. Buyer-branch gating is
  // pre-existing intent; this presence check confirms the buyer guard survives.
  { file: 'lib/actions/orders.ts', action: 'fileDispute' },
  // Seller-side commerce progression — mirrors the gated buyer-side actions.
  { file: 'lib/actions/orders.ts', action: 'acceptOrder' },
  { file: 'lib/actions/orders.ts', action: 'markPaymentReceived' },
  { file: 'lib/actions/orders.ts', action: 'markShipped' },
  { file: 'lib/actions/product.ts', action: 'createProductAction' },
  { file: 'lib/actions/product.ts', action: 'updateProductAction' },
  { file: 'lib/actions/product.ts', action: 'setProductStatusAction' },
  { file: 'lib/actions/product.ts', action: 'setProductsStatusAction' },
  { file: 'lib/actions/profile.ts', action: 'uploadAvatarAction' },
  { file: 'lib/actions/studio-updates.ts', action: 'createStudioUpdateAction' },
  { file: 'lib/actions/studio-updates.ts', action: 'editStudioUpdateAction' },
  // Byte-hosting upload route handler (not a server action; explicit entry).
  { file: 'app/api/uploads/product-image/route.ts', action: 'POST' },
];

// Deliberately NOT gated (reason per group). Reviewed for issue #132.
const UNGATED: Entry[] = [
  // Admin-only (tryRequireAdmin) — staff; verification moot.
  { file: 'lib/actions/admin-products.ts', action: 'removeListing' },
  { file: 'lib/actions/admin-products.ts', action: 'flagListing' },
  { file: 'lib/actions/admin-products.ts', action: 'reinstateListing' },
  { file: 'lib/actions/comments.ts', action: 'resolveCommentReportAction' },
  { file: 'lib/actions/comments.ts', action: 'removeReportedCommentAction' },
  { file: 'lib/actions/editorial-feature.ts', action: 'updateEditorialFeatureAction' },
  { file: 'lib/actions/feedback.ts', action: 'resolveFeedbackAction' },
  { file: 'lib/actions/orders.ts', action: 'resolveDispute' },
  { file: 'lib/actions/orders.ts', action: 'adminForceCancel' },
  { file: 'lib/actions/orders.ts', action: 'adminForceComplete' },
  { file: 'lib/actions/sellers.ts', action: 'approveSellerApplication' },
  { file: 'lib/actions/sellers.ts', action: 'rejectSellerApplication' },
  { file: 'lib/actions/users.ts', action: 'suspendUser' },
  { file: 'lib/actions/users.ts', action: 'unsuspendUser' },
  { file: 'lib/actions/users.ts', action: 'banUser' },
  { file: 'lib/actions/users.ts', action: 'unbanUser' },
  { file: 'lib/actions/users.ts', action: 'promoteToAdmin' },
  { file: 'lib/actions/users.ts', action: 'demoteToUser' },
  // Destructive only on the actor's OWN already-vetted content.
  { file: 'lib/actions/artisan.ts', action: 'deleteArtisanProfilePhotoAction' },
  { file: 'lib/actions/artisan.ts', action: 'deleteArtisanBannerAction' },
  { file: 'lib/actions/comments.ts', action: 'deleteWorkCommentAction' },
  { file: 'lib/actions/product.ts', action: 'deleteProductImageAction' },
  { file: 'lib/actions/profile.ts', action: 'deleteAvatarAction' },
  { file: 'lib/actions/studio-updates.ts', action: 'deleteStudioUpdateAction' },
  // Rearrange own already-vetted content — no new public bytes or text.
  { file: 'lib/actions/artisan.ts', action: 'setArtisanCoverFocusAction' },
  { file: 'lib/actions/artisan.ts', action: 'setFeaturedProductAction' },
  // Private to the actor / read-state / self-management (Better Auth verifies
  // its own email/password flows).
  { file: 'lib/actions/addresses.ts', action: 'createAddressAction' },
  { file: 'lib/actions/addresses.ts', action: 'updateAddressAction' },
  { file: 'lib/actions/addresses.ts', action: 'deleteAddressAction' },
  { file: 'lib/actions/appreciations.ts', action: 'toggleAppreciationAction' },
  { file: 'lib/actions/auth.ts', action: 'checkDisposableEmail' },
  { file: 'lib/actions/digest-preference.ts', action: 'setDigestEmailPreferenceAction' },
  { file: 'lib/actions/follows.ts', action: 'toggleFollowAction' },
  { file: 'lib/actions/messaging.ts', action: 'markThreadRead' },
  { file: 'lib/actions/messaging.ts', action: 'blockBuyer' },
  { file: 'lib/actions/messaging.ts', action: 'unblockBuyer' },
  { file: 'lib/actions/messaging.ts', action: 'blockSeller' },
  { file: 'lib/actions/messaging.ts', action: 'unblockSeller' },
  { file: 'lib/actions/notifications.ts', action: 'markReadAction' },
  { file: 'lib/actions/notifications.ts', action: 'markAllReadAction' },
  { file: 'lib/actions/orders.ts', action: 'reorderAction' },
  // respondToDispute — bounded, admin-supervised disclosure: a dispute statement
  // is visible only to the two order parties + the adjudicating admin (dispute
  // details are not public), inside a process both sides already reached via
  // gated commerce. Not open-ended messaging; no independent spam surface.
  { file: 'lib/actions/orders.ts', action: 'respondToDispute' },
  // Seller order EXITS — intentionally exempt (not "self-management"): a seller
  // must always be able to release a buyer's order even if their email has
  // lapsed, so refusing/cancelling is never blocked. Forward progression
  // (acceptOrder/markPaymentReceived/markShipped) IS gated — see GATED above.
  { file: 'lib/actions/orders.ts', action: 'declineOrder' },
  { file: 'lib/actions/orders.ts', action: 'cancelAsSeller' },
  { file: 'lib/actions/profile.ts', action: 'updateProfileAction' },
  { file: 'lib/actions/profile.ts', action: 'changeEmailAction' },
  { file: 'lib/actions/profile.ts', action: 'setPasswordAction' },
  { file: 'lib/actions/search.ts', action: 'search' },
  { file: 'lib/actions/wishlist.ts', action: 'toggleWishlistAction' },
];

const key = (e: Entry) => `${e.file}::${e.action}`;

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

function actionSlice(source: string, action: string): string | null {
  const marker = `export async function ${action}(`;
  const start = source.indexOf(marker);
  if (start === -1) return null;
  const nextExport = source.indexOf('export async function', start + marker.length);
  return source.slice(start, nextExport === -1 ? source.length : nextExport);
}

function enumerateActions(): Entry[] {
  const actionsDir = path.join(repoRoot, 'lib/actions');
  const entries: Entry[] = [];
  for (const name of readdirSync(actionsDir)) {
    if (!name.endsWith('.ts')) continue;
    const rel = `lib/actions/${name}`;
    const source = readFileSync(path.join(repoRoot, rel), 'utf8');
    // Only files whose FIRST statement is a `'use server'` directive expose
    // network-callable actions. Match the directive at the top (tolerating a
    // leading comment block) rather than anywhere in the source, so a file that
    // merely mentions 'use server' inside a doc-comment (e.g. recently-viewed.ts,
    // which documents that it is NOT a server action) is correctly excluded.
    const hasUseServerDirective =
      /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*['"]use server['"]\s*;?/.test(source);
    if (!hasUseServerDirective) continue;
    const re = /export async function (\w+)\s*\(/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) {
      const action = m[1];
      if (action) entries.push({ file: rel, action });
    }
  }
  return entries;
}

function main(): void {
  const gatedKeys = new Set(GATED.map(key));
  const ungatedKeys = new Set(UNGATED.map(key));

  section('every lib/actions action is classified (GATED or UNGATED)');
  const discovered = enumerateActions();
  for (const e of discovered) {
    const k = key(e);
    assert(
      gatedKeys.has(k) || ungatedKeys.has(k),
      `${e.action} (${e.file}) is classified — add it to GATED or UNGATED in check-verified-email-gating.ts`,
    );
  }
  const libActionsGated = GATED.filter((e) => e.file.startsWith('lib/actions/')).length;
  assert(
    discovered.length === libActionsGated + UNGATED.length,
    `discovered ${discovered.length} lib/actions actions; expected ${libActionsGated + UNGATED.length} (classification list is stale)`,
  );

  section('no action is in both GATED and UNGATED');
  for (const e of GATED) {
    assert(!ungatedKeys.has(key(e)), `${e.action} (${e.file}) is in GATED only, not both`);
  }

  section('GATED actions call assertVerifiedEmail (comment-stripped)');
  for (const e of GATED) {
    const source = readSource(e.file);
    if (source === null) {
      assert(false, `${e.file} exists (GATED entry ${e.action} points at a missing file)`);
      continue;
    }
    const slice = actionSlice(source, e.action);
    assert(slice !== null, `${e.file} exports ${e.action}`);
    // Require the ASSIGNED form `= assertVerifiedEmail(` so a discarded call
    // (`assertVerifiedEmail(user);` with the Result thrown away) does not pass.
    assert(
      slice !== null && /=\s*assertVerifiedEmail\(/.test(stripComments(slice)),
      `${e.action} (${e.file}) captures an assertVerifiedEmail result`,
    );
  }

  section('every UNGATED entry still exists (catches renames/removals)');
  for (const e of UNGATED) {
    const source = readSource(e.file);
    if (source === null) {
      assert(false, `${e.file} exists (UNGATED entry ${e.action} points at a missing file)`);
      continue;
    }
    assert(actionSlice(source, e.action) !== null, `${e.file} exports ${e.action}`);
  }

  finish('verified-email gating checks passed');
}

// Read a classified file, returning null (not throwing) on a bad path so the
// caller converts it into a clean `✗` assertion instead of a raw ENOENT trace.
function readSource(file: string): string | null {
  try {
    return readFileSync(path.join(repoRoot, file), 'utf8');
  } catch {
    return null;
  }
}

main();
