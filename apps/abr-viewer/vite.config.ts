import UnoCSS from '@unocss/vite';
import { fileURLToPath } from 'node:url';
import typegpu from 'unplugin-typegpu/vite';
import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [
    solid(),
    typegpu(),
    tsconfigPaths(),
    UnoCSS({ configFile: fileURLToPath(new URL('../../uno.config.ts', import.meta.url)) })
  ],
  worker: { format: 'es', plugins: () => [typegpu()] },
  server: { host: '0.0.0.0' }
});
