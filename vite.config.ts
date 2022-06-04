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
  publicDir: './public',
  resolve: {
    alias: {
      '@utils': resolve(__dirname, './src/utils'),
      '@webgl': resolve(__dirname, './src/libs/webgl'),
    },
  },
  test: {
    environment: 'jsdom',
    transformMode: {
      web: [/\.[jt]sx?$/],
    },
    // solid needs to be inline to work around
    // a resolution issue in vitest:
    deps: {
      inline: [/solid-js/],
    },
    // if you have few tests, try commenting one
    // or both out to improve performance:
    // threads: false,
    // isolate: false,
  },
});
