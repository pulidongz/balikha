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
// DATABASE_URL must be present so the module-level `parseEnv()` call in
// env.ts does not throw on import. The auth integration test that actually
// connects to the DB sets its own real URL in beforeAll.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.AUTH_SECRET = 'test-secret-at-least-32-characters-long-ok';
process.env.APP_URL = 'http://localhost:3000';

afterEach(() => {
  cleanup();
});
