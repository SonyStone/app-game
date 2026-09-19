import { defineConfig } from 'vitest/config';

/** Resolves the real Node/server exports instead of the JSX plugin's browser entry. */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/server.test.ts']
  }
});
