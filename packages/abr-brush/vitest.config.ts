import typegpu from 'unplugin-typegpu/vite';
import { defineConfig } from 'vitest/config';

/** Node tests for preset interpretation and stroke sampling; TypeGPU resolves the shared shader functions. */
export default defineConfig({
  plugins: [typegpu()],
  test: { environment: 'node', setupFiles: ['./tests/initAbr.ts'], include: ['src/**/*.test.ts'] }
});
