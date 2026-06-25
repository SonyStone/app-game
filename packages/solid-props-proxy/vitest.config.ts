import solid from 'vite-plugin-solid';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [solid()],
  test: {
    environment: 'happy-dom',
    include: ['src/index.test.tsx'],
    // vite-plugin-solid auto-injects jest-dom when it does not see a jest-dom setup path.
    setupFiles: ['./src/vitest.jest-dom-setup.ts'],
    deps: {
      inline: [/solid-js/]
    }
  }
});
