import { fileURLToPath } from 'node:url';
import typegpu from 'unplugin-typegpu/vite';
import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

/** A standalone production build keeps the editor independent of unrelated playground experiments. */
export default defineConfig({
  root: fileURLToPath(new URL('./studio', import.meta.url)),
  plugins: [solid(), typegpu()],
  worker: { format: 'es', plugins: () => [solid(), typegpu()] },
  build: { target: 'esnext', outDir: fileURLToPath(new URL('./dist-studio', import.meta.url)), emptyOutDir: true }
});
