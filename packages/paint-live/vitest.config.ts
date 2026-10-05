import { defineConfig } from 'vitest/config';

/** The relay's logic runs in Node; `server.test.ts` starts the real relay with Bun. */
export default defineConfig({
  test: { environment: 'node', include: ['test/**/*.test.ts'] }
});
