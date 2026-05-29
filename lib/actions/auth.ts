'use server';

import { isDisposableEmail } from '@/lib/email/disposable';

// Server action so the disposable-domain JSON list (~20KB gzipped) does
// not ship to the client bundle. Sub-50ms round-trip on blur is
// imperceptible UX-wise; the load-bearing gate remains the Better Auth
// databaseHooks hook in lib/auth.ts (this is the UX echo).
export async function checkDisposableEmail(email: string): Promise<boolean> {
  return isDisposableEmail(email);
}
