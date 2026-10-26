import { fileURLToPath } from 'node:url';
import solid from 'vite-plugin-solid';
import { defineConfig } from 'vitest/config';

/** Unit tests in Node with the real viewer module; files that need the DOM opt into jsdom with a docblock. */
export default defineConfig({
  plugins: [solid({ hot: false })],
  resolve: {
    alias: [
      {
        find: /^@solidjs\/web$/,
        replacement: fileURLToPath(new URL('./node_modules/@solidjs/web/dist/web.dev.js', import.meta.url))
      },
      {
        find: /^solid-js$/,
        replacement: fileURLToPath(new URL('./node_modules/solid-js/dist/solid.dev.js', import.meta.url))
      }
    ],
    conditions: ['development', 'browser']
  },
  test: {
    server: { deps: { inline: ['@solid-primitives/raf'] } },
    include: ['tests/**/*.test.{ts,tsx}'],
    environment: 'node'
  }
});
