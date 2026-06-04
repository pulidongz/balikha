// Static-admin bootstrap (ticket #26).
//
// Ensures a real, loggable-into admin account exists with role='admin' and a
// verified email, keyed on ADMIN_EMAIL / ADMIN_PASSWORD. This is the static
// admin for dev/prod and the lockout-recovery net for the is_admin→role
// migration.
//
// Idempotent:
//   - If the user already exists, ensure role='admin' + emailVerified=true.
//   - Otherwise create it via the internal signUpEmail (so the plugin's
//     role-injecting hook + password hashing run), then set role='admin' +
//     emailVerified=true.
//
// Usage:  npm run admin:bootstrap
//   Requires ADMIN_EMAIL and ADMIN_PASSWORD to be set (throws if either is
//   unset — they are .optional() in env.ts so the build never depends on them,
//   but this script needs them at runtime). In prod, set them in
//   /etc/balikha/production.env, run once, then rotate the password.
//
// Env loading: invoked via `tsx --env-file=.env.development`, same as the
// seed. Don't add dotenv.config() here — ESM hoists imports, and `@/db`
// (→ `@/env`) would run before any inline config() call.

import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { user } from '@/db/schema';
import { auth } from '@/lib/auth';
import { env } from '@/env';
import { logger } from '@/lib/logger';

async function main(): Promise<void> {
  const email = env.ADMIN_EMAIL;
  const password = env.ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error(
      'admin:bootstrap requires ADMIN_EMAIL and ADMIN_PASSWORD to be set. ' +
        'Set them in your env file (dev) or /etc/balikha/production.env (prod) and re-run.',
    );
  }

  const [existing] = await db.select().from(user).where(eq(user.email, email)).limit(1);

  if (existing) {
    const needsUpdate = existing.role !== 'admin' || !existing.emailVerified;
    if (needsUpdate) {
      await db
        .update(user)
        .set({ role: 'admin', emailVerified: true })
        .where(eq(user.id, existing.id));
      logger.info({ email, userId: existing.id }, 'Bootstrap: existing user ensured admin');
    } else {
      logger.info({ email, userId: existing.id }, 'Bootstrap: admin already present (no-op)');
    }
    return;
  }

  const result = await auth.api.signUpEmail({ body: { email, password, name: 'Admin' } });
  if (!result.user) {
    throw new Error(`Bootstrap: failed to create admin user ${email}`);
  }

  await db
    .update(user)
    .set({ role: 'admin', emailVerified: true })
    .where(eq(user.id, result.user.id));
  logger.info({ email, userId: result.user.id }, 'Bootstrap: admin account created');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    logger.error({ err: e }, 'Bootstrap-admin failed');
    process.exit(1);
  });
