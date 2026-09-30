import { fileURLToPath } from 'node:url';
import solid from 'vite-plugin-solid';
import { defineConfig } from 'vitest/config';

/** Unit tests run in happy-dom with Solid's browser build; WebGPU and TypeGPU are replaced by test doubles. */
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
