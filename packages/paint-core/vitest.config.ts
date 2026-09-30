import typegpu from 'unplugin-typegpu/vite';
import solid from 'vite-plugin-solid';
import { defineConfig } from 'vitest/config';

/** Node tests by default; DOM tests opt into jsdom with a `@vitest-environment jsdom` docblock. */
export default defineConfig({
  plugins: [solid(), typegpu()],
  resolve: { conditions: ['development', 'browser'] },
  test: { environment: 'node', setupFiles: ['./tests/initAbr.ts'], include: ['src/**/*.test.{ts,tsx}'] }
});
