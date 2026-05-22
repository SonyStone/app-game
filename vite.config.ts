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
import { vitePluginMarkdown } from './packages/vite-plugin-markdown/src';
import { vitePluginShiki } from './packages/vite-plugin-shiki/src';

const webAppRoot = resolve(__dirname, 'apps/web');
const apps = resolve(__dirname, 'apps');
const packages = resolve(__dirname, 'packages');
const devServerPort = Number(process.env.APP_PORT ?? process.env.PORT ?? '3120');

export default defineConfig({
  root: webAppRoot,
  plugins: [
    vitePluginMarkdown(),
    vitePluginShiki({
      themes: ['css-variables', 'dark-plus']
    }),
    wasm(),
    topLevelAwait(),
    // solidDevtools({
    //   /* features options - all disabled by default */
    //   autoname: true // e.g. enable autoname
    // }),
    UnoCSS({
      configFile: resolve(__dirname, 'uno.config.ts')
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
    port: devServerPort,
    host: '0.0.0.0',
    fs: {
      allow: [resolve(__dirname)]
    }
  },
  resolve: {
    alias: {
      '@app-game/solid-dnd-playground': resolve(apps, 'solid-dnd-playground/src'),
      '@app-game/dnd-playground': resolve(apps, 'dnd-playground/src'),
      '@app-game/solidjs-patterns': resolve(apps, 'solidjs-patterns/src'),
      '@app-game/app-router': resolve(packages, 'app-router'),
      '@app-game/chroma': resolve(packages, 'chroma'),
      '@app-game/ecsy': resolve(packages, 'ecsy'),
      '@app-game/litegraph': resolve(packages, 'litegraph'),
      '@app-game/math': resolve(packages, 'math'),
      '@app-game/math-examples': resolve(packages, 'math-examples'),
      '@app-game/ogl-examples': resolve(packages, 'ogl-examples'),
      '@app-game/paint': resolve(packages, 'paint'),
      '@app-game/penner-easing-equations': resolve(packages, 'penner-easing-equations'),
      '@app-game/piecs': resolve(packages, 'piecs'),
      '@app-game/spector': resolve(packages, 'spector'),
      '@app-game/solid-pixi': resolve(packages, 'solid-pixi'),
      '@app-game/solid-three': resolve(packages, 'solid-three'),
      '@app-game/solid-utils': resolve(packages, 'solid-utils'),
      '@app-game/three': resolve(packages, 'three'),
      '@app-game/three-examples': resolve(packages, 'three-examples'),
      '@app-game/ui-components': resolve(packages, 'ui-components'),
      '@app-game/ui-components-examples': resolve(packages, 'ui-components-examples'),
      '@app-game/utils': resolve(packages, 'utils'),
      '@app-game/webgl-examples': resolve(packages, 'webgl-examples'),
      '@utils': resolve(packages, 'solid-utils'),
      '@/ldtk-ts': resolve(packages, 'ldtk-ts')
    }
  },
  build: {
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 5000,
    target: 'esnext',
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true
    // minify: false
  },
  worker: {
    format: 'es',
    plugins: () => [solidPlugin()]
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
