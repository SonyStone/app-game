import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadAbr } from '../src/index';

/** Compare independently implemented codecs on real files, including cross-backend writes. */
const js = await loadAbr('js');
const wasm = await loadAbr('wasm', readFileSync(new URL('../wasm/pkg/photoshop_abr_wasm_bg.wasm', import.meta.url)));
const paths = process.argv.slice(2);
const directory = resolve(import.meta.dirname, '../files');
const files = paths.length
  ? paths
  : readdirSync(directory)
      .filter((f) => f.endsWith('.abr'))
      .sort()
      .map((f) => resolve(directory, f));
let brushes = 0,
  images = 0,
  edits = 0;
for (const path of files) {
  const bytes = readFileSync(path);
  const a = js.readLibrary(bytes),
    b = wasm.readLibrary(bytes);
  assert.deepEqual(a, b, `${path}: portable library`);
  assert.deepEqual(js.writeAbr(b.document), new Uint8Array(bytes), `${path}: WASM → JS write`);
  assert.deepEqual(wasm.writeAbr(a.document), new Uint8Array(bytes), `${path}: JS → WASM write`);
  for (const [index, resource] of a.resources.entries()) {
    let expected;
    try {
      expected = wasm.decodeResource(b.resources[index]!.source);
    } catch {
      assert.throws(() => js.decodeResource(resource.source));
      continue;
    }
    assert.deepEqual(js.decodeResource(resource.source), expected, `${path}: resource ${index}`);
    images++;
  }
  const first = a.document.brushes.findIndex((brush) => brush.tip?.hardness !== undefined);
  if (first >= 0) {
    a.document.brushes[first]!.tip!.hardness = js.percent(43);
    b.document.brushes[first]!.tip!.hardness = wasm.percent(43);
    assert.deepEqual(js.writeAbr(a.document), wasm.writeAbr(b.document), `${path}: edit`);
    edits++;
  }
  if (a.document.brushes.length) {
    const composition = {
      sources: [a.document.source],
      brushes: [{ source: 0, preset: a.document.brushes.at(-1)! }],
      hierarchy: [{ kind: 'preset' as const }]
    };
    assert.deepEqual(js.composeAbr(composition), wasm.composeAbr(composition), `${path}: composition`);
  }
  brushes += a.document.brushes.length;
  console.log(
    JSON.stringify({
      file: path,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      brushes: a.document.brushes.length,
      resources: a.resources.length,
      equal: true
    })
  );
}
console.log(JSON.stringify({ files: files.length, brushes, images, edits, equal: true }));
