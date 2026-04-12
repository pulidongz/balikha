import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { auth } from './auth';

// Uses a test database. Assumes Postgres is running and balikha_test exists.
const TEST_DB_URL = 'postgresql://balikha:secret@localhost:5432/balikha_test';

let testPool: pg.Pool;

beforeAll(async () => {
  // Run migrations against the test DB
  testPool = new pg.Pool({ connectionString: TEST_DB_URL });
  await migrate(drizzle(testPool), { migrationsFolder: './drizzle' });
});

beforeEach(async () => {
  // Truncate tables for isolation
  await testPool.query('TRUNCATE "user", "session", "account", "verification" CASCADE');
});

afterAll(async () => {
  await testPool.end();
});

describe('Better Auth — signup security', () => {
  // ★ THE PRIMARY SECURITY TEST — HTTP path
  // This exercises the actual attack surface: an HTTP POST to the signup
  // endpoint with role: 'admin' in the JSON body. Uses auth.handler
  // (the same web-standard handler that the catch-all route delegates to).
  it('ignores role in the HTTP signup payload (input: false)', async () => {
    const request = new Request('http://localhost:3000/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'attacker-http@example.com',
        password: 'password-at-least-10-chars',
        name: 'Attacker HTTP',
        role: 'admin',
      }),
    });

    const response = await auth.handler(request);
    expect(response.status).toBeLessThan(400);

    // Verify in the database that the role is 'buyer', NOT 'admin'
    const { rows } = await testPool.query<{ role: string }>(
      'SELECT role FROM "user" WHERE email = $1',
      ['attacker-http@example.com'],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe('buyer');
  });

  // ★ DEFENSE-IN-DEPTH — direct API path
  // Belt-and-suspenders: also test via the direct function call API.
  it('ignores role via direct API call (input: false)', async () => {
    const result = await auth.api.signUpEmail({
      body: {
        email: 'attacker-direct@example.com',
        password: 'password-at-least-10-chars',
        name: 'Attacker Direct',
        // @ts-expect-error — deliberately passing a forbidden field
        role: 'admin',
      },
    });
    expect(result).toBeTruthy();

    // Verify in the database that the role is 'buyer', NOT 'admin'
    const { rows } = await testPool.query<{ role: string }>(
      'SELECT role FROM "user" WHERE email = $1',
      ['attacker-direct@example.com'],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe('buyer');
  });

  it('enforces minimum password length of 10', async () => {
    await expect(
      auth.api.signUpEmail({
        body: {
          email: 'short@example.com',
          password: 'short',
          name: 'Short Password',
        },
      }),
    ).rejects.toThrow();
  });

  it('creates a user with default role buyer on valid signup', async () => {
    await auth.api.signUpEmail({
      body: {
        email: 'normal@example.com',
        password: 'password-at-least-10-chars',
        name: 'Normal User',
      },
    });

    const { rows } = await testPool.query<{ role: string }>(
      'SELECT role FROM "user" WHERE email = $1',
      ['normal@example.com'],
    );
    expect(rows[0].role).toBe('buyer');
  });
});
