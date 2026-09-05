import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

/** Each page/worker script is an independent IIFE with no shared runtime chunks. */
export default defineConfig(({ mode }) => {
  const entry = mode === 'bridge' || mode === 'background' ? mode : 'agent';
  return {
    build: {
      emptyOutDir: false,
      outDir: 'dist-extension',
      target: 'es2020',
      lib: {
        entry: fileURLToPath(new URL(`./src/${entry}.ts`, import.meta.url)),
        formats: ['iife'],
        name: `WebGLSpector_${entry}`,
        fileName: () => `${entry}.js`
      }
    }
  };
});
