import { fileURLToPath } from 'node:url';
import typegpu from 'unplugin-typegpu/vite';
import solid from 'vite-plugin-solid';
import { defineConfig } from 'vitest/config';

/**
 * Feature tests run in Node by default; component tests opt into jsdom with a `@vitest-environment jsdom` docblock.
 * Runtime, renderer and ABR engine tests live in `@app-game/paint-core`, `@app-game/abr-paint` and `@app-game/abr-brush`.
 */
export default defineConfig({
  plugins: [solid(), typegpu()],
  resolve: { conditions: ['development', 'browser'] },
  test: {
    environment: 'node',
    setupFiles: [fileURLToPath(import.meta.resolve('@testing-library/jest-dom/vitest'))],
    include: ['src/**/*.test.{ts,tsx}']
  }
});
