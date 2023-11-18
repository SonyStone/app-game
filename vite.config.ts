import UnoCSS from '@unocss/vite';
import { resolve } from 'path';
import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import solidSvg from 'vite-plugin-solid-svg';

// node_modules\mediainfo.js\dist\MediaInfoModule.wasm
// D:\1D\Game-Dev\app-game\node_modules\mediainfo.js\dist\MediaInfoModule.wasm
// src D:\1D\Game-Dev\app-game\node_modules\mediainfo.js\dist\MediaInfoModule.wasm

const root = resolve(__dirname, 'src');
const packages = resolve(__dirname, 'packages');

export default defineConfig({
  plugins: [
    UnoCSS({
      // your config or in uno.config.ts
    }),
    solidPlugin(),
    solidSvg()
    // viteFBXPlugin(),
    // vitePluginWasmPack('./wasm_game_of_life'),
    // rust()
  ],
  server: {
    port: 3200
  },
  publicDir: './public',
  resolve: {
    alias: {
      '@utils': resolve(root, 'utils'),
      '@webgl': resolve(root, 'libs', 'webgl'),
      '@packages': resolve(packages),
      '@/ldtk-ts': resolve(packages, 'ldtk-ts')
    }
  },
  build: {
    assetsInlineLimit: 0
  },
  test: {
    environment: 'jsdom',
    transformMode: {
      web: [/\.[jt]sx?$/]
    },
    // solid needs to be inline to work around
    // a resolution issue in vitest:
    deps: {
      inline: [/solid-js/]
    }
    // if you have few tests, try commenting one
    // or both out to improve performance:
    // threads: false,
    // isolate: false,
  }
});
