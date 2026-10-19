import { defineConfig } from 'vitest/config';

/** Unit tests in Node; the Playwright specs in `e2e` run with `test:e2e`. */
export default defineConfig({
  test: { include: ['*.test.ts', 'src/**/*.test.{ts,tsx}'], environment: 'node' }
});
