import UnoCSS from '@unocss/vite';
import { fileURLToPath } from 'node:url';
import typegpuPlugin from 'unplugin-typegpu/vite';
import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import wasm from 'vite-plugin-wasm';

export default defineConfig({
  plugins: [
    // Rapier ships its physics as a WebAssembly module imported from JavaScript.
    wasm(),
    solid(),
    // Compiles TypeScript functions marked 'use gpu' to WGSL.
    typegpuPlugin({}),
    UnoCSS({
      configFile: fileURLToPath(new URL('../../uno.config.ts', import.meta.url))
    })
  ],
  server: {
    host: '0.0.0.0'
  }
});
