import UnoCSS from '@unocss/vite';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

const explorerHtml = fileURLToPath(new URL('./explorer.html', import.meta.url));
const backgroundScript = fileURLToPath(new URL('./src/extension/background.ts', import.meta.url));

export default defineConfig({
  base: './',
  publicDir: 'extension/public',
  plugins: [
    solid(),
    UnoCSS({
      configFile: fileURLToPath(new URL('../../uno.config.ts', import.meta.url))
    })
  ],
  build: {
    emptyOutDir: true,
    outDir: 'dist-extension',
    rolldownOptions: {
      input: {
        explorer: explorerHtml,
        background: backgroundScript
      },
      output: {
        entryFileNames: (chunkInfo) =>
          chunkInfo.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    }
  }
});
