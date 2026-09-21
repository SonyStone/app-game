import { fileURLToPath } from 'node:url';
import solid from 'vite-plugin-solid';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [solid()],
  resolve: { conditions: ['browser'] },
  test: {
    environment: 'happy-dom',
    server: { deps: { inline: [/solid-js/, /@solid-primitives/] } },
    include: ['src/**/*.test.{ts,tsx}']
  }
});
