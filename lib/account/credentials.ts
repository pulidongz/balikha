import { and, eq, isNotNull } from 'drizzle-orm';
import { db } from '@/db';
import { account } from '@/db/schema';

// True when the user has an email/password credential. Mirrors Better Auth's
// own check in setPassword (findAccounts(...).find(providerId === 'credential'
// && account.password)): a Google-only user has a 'google' account row but no
// 'credential' row with a password, so this returns false and the UI offers
// "Set a password" instead of "Change password".
export async function userHasPassword(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: account.id })
    .from(account)
    .where(
      and(
        eq(account.userId, userId),
        eq(account.providerId, 'credential'),
        isNotNull(account.password),
      ),
    )
    .limit(1);
  return Boolean(row);
}
