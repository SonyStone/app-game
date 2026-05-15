import path from 'path';
import solid from 'vite-plugin-solid';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [solid()],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['test/**/*.test.{ts,tsx}'],
    setupFiles: ['./test/setup.ts']
  },
  resolve: {
    alias: {
      src: path.resolve(__dirname, 'src')
    },
    conditions: ['development', 'browser']
  }
});
