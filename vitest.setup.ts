import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Mock 'server-only' so Vitest can import modules that use it.
// Vitest is not Next.js's bundler — the 'server-only' package throws
// a build-time error only inside Next.js's webpack/turbopack pipeline.
// The real guard is enforced at `next build` time; this mock lets us
// unit-test server modules in Vitest without that throw.
vi.mock('server-only', () => ({}));

// Minimal env for modules that import `env` transitively during tests.
// DATABASE_URL points at the real test database because modules like
// db/index.ts create a pg.Pool at import time (before beforeAll runs).
// The auth integration tests use this pool to run against balikha_test.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://balikha:secret@localhost:5432/balikha_test';
process.env.AUTH_SECRET = 'test-secret-at-least-32-characters-long-ok';
process.env.APP_URL = 'http://localhost:3000';

afterEach(() => {
  cleanup();
});
