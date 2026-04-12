import 'server-only';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { env } from '../config/env';
import { logger } from '../lib/logger';

export const pool: pg.Pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  allowExitOnIdle: false,
});

pool.on('error', (err) => {
  logger.error({ err }, 'postgres pool background error');
});

export const db = drizzle(pool);

/**
 * Test-only infrastructure: drains the pool so tests can clean up
 * between runs. Production code never calls this — the process
 * exits naturally. Graceful shutdown is deferred to ops/traefik-deployment.
 */
export async function closePool(): Promise<void> {
  logger.info('closing postgres pool');
  await pool.end();
}
