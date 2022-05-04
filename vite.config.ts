import { resolve } from 'path';
import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';

import rust from './rollup-plugin-rust';

export default defineConfig({
  plugins: [
    solidPlugin(),
    // vitePluginWasmPack('./wasm_game_of_life'),
    rust(),
  ],
  build: {
    rollupOptions: {
      input: [
        resolve(__dirname, 'index.html'),
        resolve(__dirname, 'wasm_game_of_life', 'Cargo.toml'),
      ],
    },
    target: 'esnext',
    polyfillDynamicImport: false,
  },
  publicDir: './public',
});
