import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

/** Ship compiled ESM while keeping Solid and primitives owned by the consuming application. */
export default defineConfig({
  plugins: [
    solid(),
    {
      name: 'solid-tabs-module-css',
      // Vite extracts library CSS; retain its import for consuming bundlers.
      renderChunk(code, chunk) {
        if (!chunk.isEntry) return;
        return { code: `${code}\nimport "./solid-tabs.css";`, map: null };
      }
    }
  ],
  build: {
    lib: { entry: 'src/index.ts', formats: ['es'], fileName: 'index', cssFileName: 'solid-tabs' },
    minify: false,
    sourcemap: true,
    rollupOptions: {
      external: (id) => id === 'solid-js' || id.startsWith('@solidjs/') || id.startsWith('@solid-primitives/')
    }
  }
});
