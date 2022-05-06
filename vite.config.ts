import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';

import rust from './rollup-plugin-rust';

export default defineConfig({
  plugins: [
    solidPlugin(),
    // vitePluginWasmPack('./wasm_game_of_life'),
    rust(),
  ],
  publicDir: './public',
});
