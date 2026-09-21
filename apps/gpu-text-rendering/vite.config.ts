import { fileURLToPath } from 'node:url';
import typegpu from 'unplugin-typegpu/vite';
import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

/** Standalone viewer build; the web host also compiles the exported source with Solid and TypeGPU. */
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [solid(), typegpu()],
  build: {
    target: 'esnext',
    assetsInlineLimit: 0
  }
});
