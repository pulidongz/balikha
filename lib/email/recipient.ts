import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { user } from '@/db/schema';

export interface EmailRecipient {
  email: string;
}

// Look up a recipient's email address by user id. Returns null when
// the user no longer exists (e.g. the account was deleted between the
// notification insert and the post-commit email dispatch). Callers skip the
// send on null — they never substitute a fallback address (CLAUDE.md: no
// fallback logic). The `user` table is Better Auth's (db/schema/auth.ts).
export async function getEmailRecipient(userId: string): Promise<EmailRecipient | null> {
  const [row] = await db
    .select({ email: user.email })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return row ?? null;
}
