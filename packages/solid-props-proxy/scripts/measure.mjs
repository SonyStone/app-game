import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

// Include the small primitive dependencies; the consumer supplies the Solid runtime.
const result = await build({
  entryPoints: [fileURLToPath(new URL('../src/index.tsx', import.meta.url))],
  bundle: true,
  minify: true,
  format: 'esm',
  platform: 'browser',
  conditions: ['browser', 'production'],
  external: ['solid-js', 'solid-js/*', '@solidjs/web', '@solidjs/web/*'],
  define: { 'process.env.NODE_ENV': '"production"' },
  write: false
});
const code = result.outputFiles[0].contents;
console.log(
  JSON.stringify(
    { minifiedBytes: code.byteLength, gzipBytes: gzipSync(code).byteLength, external: ['solid-js', '@solidjs/web'] },
    null,
    2
  )
);
