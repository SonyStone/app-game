import { defineConfig } from 'vitest/config';
import wasm from 'vite-plugin-wasm';

export default defineConfig({
  plugins: [wasm()],
  test: {
    include: ['src/**/*.test.ts'],
    // Rapier imports its WebAssembly module from JavaScript, which only the wasm plugin can load.
    server: { deps: { inline: [/@dimforge/] } }
  }
});
