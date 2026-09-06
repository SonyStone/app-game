import { fileURLToPath } from 'node:url';
import solid from 'vite-plugin-solid';
import { defineConfig } from 'vitest/config';

/** Tests workspace changes against real ABR fixtures using Solid's client signal semantics. */
export default defineConfig({
  plugins: [solid({ hot: false })],
  resolve: {
    alias: [
      {
        find: /^solid-js$/,
        replacement: fileURLToPath(new URL('./node_modules/solid-js/dist/dev.js', import.meta.url))
      }
    ],
    conditions: ['development', 'browser']
  },
  test: { include: ['tests/**/*.test.{ts,tsx}'], environment: 'node' }
});
