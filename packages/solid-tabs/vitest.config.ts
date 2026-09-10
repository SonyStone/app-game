import solid from 'vite-plugin-solid';
import { defineConfig } from 'vitest/config';
export default defineConfig({
  plugins: [solid()],
  resolve: { conditions: ['development', 'browser'] },
  test: {
    css: true,
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    environmentOptions: { jsdom: { pretendToBeVisual: true } },
    include: ['test/**/*.test.{ts,tsx}'],
    server: { deps: { inline: [/solid-js/, /@solidjs/, /@solid-primitives/] } }
  }
});
