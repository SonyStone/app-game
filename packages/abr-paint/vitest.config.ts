import typegpu from 'unplugin-typegpu/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [typegpu()],
  test: { setupFiles: ['./tests/initAbr.ts'], environment: 'node', include: ['src/**/*.test.ts'] }
});
