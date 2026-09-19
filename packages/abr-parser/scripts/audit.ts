import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { initAbr, parseAbr, writeAbr } from '../src/index';

/** Audit exact round trips without changing source files. */
async function main(): Promise<void> {
  await initAbr(readFileSync(new URL('../wasm/pkg/photoshop_abr_wasm_bg.wasm', import.meta.url)));
  const directory = resolve(import.meta.dirname, '../files');
  const paths = process.argv.slice(2);
  const files = paths.length
    ? paths
    : readdirSync(directory)
        .filter((f) => f.endsWith('.abr'))
        .sort()
        .map((f) => resolve(directory, f));
  const reports = files.map((path) => {
    const bytes = readFileSync(path);
    try {
      const document = parseAbr(bytes),
        output = writeAbr(structuredClone(document));
      return {
        path,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        bytes: bytes.length,
        version: document.version,
        sampleLayout: document.sampleLayout,
        brushes: document.brushes.length,
        resources: document.resources.length,
        exactRoundtrip: bytes.equals(output)
      };
    } catch (error) {
      return { path, error: String(error), exactRoundtrip: false };
    }
  });
  console.log(JSON.stringify({ scope: 'ABR structure and exact preservation', reports }, null, 2));
  if (reports.some((r) => !r.exactRoundtrip)) process.exitCode = 1;
}
await main();
