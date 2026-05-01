import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

// Next.js auto-loads .env.development at runtime, but drizzle-kit (CLI) does
// not — it only reads .env via `dotenv/config`. Load it explicitly so
// db:push / db:studio / db:generate / db:migrate all see DATABASE_URL.
config({ path: '.env.development' });

export default defineConfig({
  out: './drizzle',
  schema: './db/schema/index.ts',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
});
