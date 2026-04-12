import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    exclude: ['**/node_modules/**', '**/e2e/**'],
  },
  resolve: {
    // Resolves tsconfig `paths` aliases (e.g. @/*) and handles the
    // TypeScript ESM `.js`-extension convention (`@/foo/bar.js` -> `bar.ts`).
    tsconfigPaths: true,
  },
});
