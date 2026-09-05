import typegpu from 'unplugin-typegpu/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [typegpu()],
  test: { environment: 'node', include: ['packages/paint/studio/**/*.test.ts'] }
});
