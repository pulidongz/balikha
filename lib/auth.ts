import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '@/db';

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg' }),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
  },
  // Both the canonical https://balikha.localhost:8443 (via Caddy) and the
  // direct http://localhost:3000 (bypass Caddy) need to pass Better Auth's
  // CSRF Origin check during local dev. The plain-localhost entry can come
  // off once everyone uses the Caddy URL day-to-day.
  trustedOrigins: ['https://balikha.localhost:8443', 'http://localhost:3000'],
});

export type Session = typeof auth.$Infer.Session;
