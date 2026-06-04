// Demote an admin user by email.
//
// Usage: npm run admin:demote -- <email>
//
// Env loading: invoked via `tsx --env-file=.env.development`, same as the
// seed. Don't add dotenv.config() here — ESM hoists imports, and `@/db`
// (→ `@/env`) would run before any inline config() call.

import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { user } from '@/db/schema';
import { logger } from '@/lib/logger';

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: npm run admin:demote -- <email>');
    process.exit(1);
  }

  const [target] = await db.select().from(user).where(eq(user.email, email)).limit(1);
  if (!target) {
    console.error(`No user found with email: ${email}`);
    process.exit(1);
  }

  if (target.role !== 'admin') {
    logger.info({ email }, 'User is not an admin');
    process.exit(0);
  }

  await db.update(user).set({ role: 'user' }).where(eq(user.id, target.id));
  logger.info({ email, userId: target.id }, 'User demoted from admin');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    logger.error({ err: e }, 'Demote-admin failed');
    process.exit(1);
  });
