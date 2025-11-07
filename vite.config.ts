import UnoCSS from '@unocss/vite';
import { resolve } from 'path';
// import solidDevtools from 'solid-devtools/vite';
import typegpuPlugin from 'unplugin-typegpu/vite';
import { defineConfig } from 'vite';
import glsl from 'vite-plugin-glsl';
import solidPlugin from 'vite-plugin-solid';
import solidSvg from 'vite-plugin-solid-svg';
import topLevelAwait from 'vite-plugin-top-level-await';
import wasm from 'vite-plugin-wasm';
import vitePluginArraybuffer from './packages/vite-plugin-arraybuffer/src/main';

const root = resolve(__dirname, 'src');
const packages = resolve(__dirname, 'packages');

export default defineConfig({
  plugins: [
    wasm(),
    topLevelAwait(),
    // solidDevtools({
    //   /* features options - all disabled by default */
    //   autoname: true // e.g. enable autoname
    // }),
    UnoCSS({
      // your config or in uno.config.ts
    }),
    solidPlugin(),
    // ? check other plugins for solid-js
    // https://github.com/thednp/vite-solid-svg
    // https://github.com/jfgodoy/vite-plugin-solid-svg
    solidSvg(),
    vitePluginArraybuffer(),
    glsl(),
    // viteFBXPlugin(),
    typegpuPlugin({})
  ],
  server: {
    port: 3200,
    host: '0.0.0.0'
  },
  publicDir: './public',
  resolve: {
    alias: {
      '@utils': resolve(packages, 'solid-utils'),
      '@packages': resolve(packages),
      '@/ldtk-ts': resolve(packages, 'ldtk-ts')
    }
  },
  build: {
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 5000
    // minify: false
  },
  test: {
    environment: 'happy-dom',
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
