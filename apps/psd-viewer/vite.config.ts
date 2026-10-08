import UnoCSS from '@unocss/vite';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

/** Standalone PSD Viewer; the shared app-game server mounts the same screen at /psd-viewer. */
export default defineConfig({
  plugins: [solid(), UnoCSS({ configFile: fileURLToPath(new URL('../../uno.config.ts', import.meta.url)) })],
  worker: { format: 'es' },
  server: { host: '0.0.0.0' },
  build: { target: 'es2022' }
});
