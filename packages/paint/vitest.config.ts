import typegpu from 'unplugin-typegpu/vite';
import solid from 'vite-plugin-solid';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [solid(), typegpu()],
  resolve: { conditions: ['development', 'browser'] },
  test: { environment: 'node', include: ['packages/paint/studio/**/*.test.ts'] }
});
