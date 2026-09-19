import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

/** Isolated preview of the same showcase, without importing the application's other routes. */
export default defineConfig({
  root: fileURLToPath(new URL('./playground', import.meta.url)),
  plugins: [solid()],
  server: {
    host: '127.0.0.1',
    port: 3121,
    strictPort: true,
    fs: { allow: [fileURLToPath(new URL('../..', import.meta.url))] }
  }
});
