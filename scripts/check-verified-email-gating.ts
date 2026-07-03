import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert, finish, section } from './lib/check-harness';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Presence tripwire for Balikha's per-action email-verification posture:
// every action listed here must call assertVerifiedEmail somewhere in its
// slice. This proves the guard call has NOT been deleted from the action —
// it does NOT prove every branch is gated (setProductStatusAction /
// setProductsStatusAction / fileDispute gate one branch by design; branch
// placement is reviewed by humans). When gating a new privileged action,
// add it to this list.
const REQUIRED: Array<{ file: string; action: string }> = [
  { file: 'lib/actions/messaging.ts', action: 'createPrePurchaseThread' },
  { file: 'lib/actions/messaging.ts', action: 'sendMessage' },
  { file: 'lib/actions/artisan.ts', action: 'becomeArtisanAction' },
  { file: 'lib/actions/artisan.ts', action: 'updateArtisanProfileAction' },
  { file: 'lib/actions/artisan.ts', action: 'uploadArtisanProfilePhotoAction' },
  { file: 'lib/actions/artisan.ts', action: 'uploadArtisanBannerAction' },
  { file: 'lib/actions/product.ts', action: 'createProductAction' },
  { file: 'lib/actions/product.ts', action: 'updateProductAction' },
  { file: 'lib/actions/product.ts', action: 'setProductStatusAction' },
  { file: 'lib/actions/product.ts', action: 'setProductsStatusAction' },
  { file: 'lib/actions/orders.ts', action: 'placeOrder' },
  { file: 'lib/actions/orders.ts', action: 'cancelAsBuyer' },
  { file: 'lib/actions/orders.ts', action: 'markReceived' },
  { file: 'lib/actions/orders.ts', action: 'fileDispute' },
  { file: 'lib/actions/comments.ts', action: 'postWorkCommentAction' },
  { file: 'lib/actions/comments.ts', action: 'reportWorkCommentAction' },
  { file: 'lib/actions/feedback.ts', action: 'submitFeedbackAction' },
  { file: 'lib/actions/profile.ts', action: 'uploadAvatarAction' },
];

function actionSlice(source: string, action: string): string | null {
  // Anchor on the name plus '(' so a sibling whose name is a prefix of this
  // one (e.g. sendMessageDraft vs sendMessage) can never mis-anchor the slice.
  const marker = `export async function ${action}(`;
  const start = source.indexOf(marker);
  if (start === -1) return null;
  const nextExport = source.indexOf('export async function', start + marker.length);
  return source.slice(start, nextExport === -1 ? source.length : nextExport);
}

function main(): void {
  section('verified-email gating coverage');
  for (const { file, action } of REQUIRED) {
    const source = readFileSync(path.join(repoRoot, file), 'utf8');
    const slice = actionSlice(source, action);
    assert(slice !== null, `${file} exports ${action}`);
    assert(
      slice !== null && slice.includes('assertVerifiedEmail('),
      `${action} (${file}) calls assertVerifiedEmail`,
    );
  }
  finish('verified-email gating checks passed');
}

main();
