import UnoCSS from '@unocss/vite';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

export default defineConfig({
  plugins: [
    solid(),
    UnoCSS({
      configFile: fileURLToPath(new URL('../../uno.config.ts', import.meta.url))
    })
  ],
  server: {
    host: '0.0.0.0'
  }
});
