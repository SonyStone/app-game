import { fileURLToPath } from 'node:url';
import solid from 'vite-plugin-solid';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [solid()],
  resolve: { conditions: ['development', 'browser'] },
  test: {
    environment: 'jsdom',
    setupFiles: [fileURLToPath(import.meta.resolve('@testing-library/jest-dom/vitest'))],
    include: ['src/**/*.test.tsx']
  }
});
