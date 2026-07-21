import solid from 'vite-plugin-solid';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  plugins: [solid()],
  test: {
    environment: 'node',
    include: ['virtual-scroll-nested/**/*.test.ts'],
    setupFiles: ['./vitest.jest-dom-setup.ts']
  }
});
