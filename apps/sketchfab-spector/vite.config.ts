import UnoCSS from '@unocss/vite';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

const devtoolsPage = fileURLToPath(new URL('./devtools.html', import.meta.url));
const panelPage = fileURLToPath(new URL('./panel.html', import.meta.url));

export default defineConfig({
  base: './',
  publicDir: 'extension',
  plugins: [
    solid(),
    UnoCSS({
      configFile: fileURLToPath(new URL('../../uno.config.ts', import.meta.url))
    })
  ],
  build: {
    emptyOutDir: true,
    outDir: 'dist-extension',
    target: 'es2020',
    rollupOptions: {
      input: {
        devtools: devtoolsPage,
        panel: panelPage
      }
    }
  }
});
