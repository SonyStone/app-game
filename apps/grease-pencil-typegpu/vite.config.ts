import UnoCSS from '@unocss/vite';
import { fileURLToPath } from 'node:url';
import typegpuPlugin from 'unplugin-typegpu/vite';
import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [
    tsconfigPaths({ root: '../..' }),
    solid(),
    typegpuPlugin({}),
    UnoCSS({
      configFile: fileURLToPath(new URL('../../uno.config.ts', import.meta.url))
    })
  ],
  server: {
    host: '0.0.0.0'
  },
  worker: {
    plugins: () => [typegpuPlugin({})]
  }
});
