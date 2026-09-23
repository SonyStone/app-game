import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import init, { decodeDocument } from '../src/features/document/format/wasm/gpu_document.js';

// Golden hashes were captured from the original TypeScript decoder before migration.
const golden = JSON.parse(await readFile(new URL('../tests/fixtures/demo-digests.json', import.meta.url), 'utf8'));
const wasm = await readFile(new URL('../src/features/document/format/wasm/gpu_document_bg.wasm', import.meta.url));
await init({ module_or_path: wasm });

const bytes = await readFile(new URL('../src/features/document/assets/demo.gdoc', import.meta.url));
const outcome = decodeDocument(bytes);
assert.equal(outcome.errorCode, '');
const document = outcome.takeDocument();
outcome.free();
assert.ok(document);

const digest = (data) =>
  createHash('sha256')
    .update(new Uint8Array(data.buffer, data.byteOffset, data.byteLength))
    .digest('hex');
const vertices = document.takeVertices();
assert.equal(vertices.length / 72, golden.glyphs);
assert.equal(document.takePages().length / 4, golden.pages);
assert.equal(digest(vertices), golden.vertices);
assert.equal(digest(document.takePositionsX()), golden.positionsX);
assert.equal(digest(document.takePositionsY()), golden.positionsY);
assert.equal(digest(document.takeAtlas()), golden.atlas);
assert.equal(digest(document.takeAtlasVertices()), golden.atlasVertices);
document.free();

const invalid = decodeDocument(new Uint8Array([1, 2, 3]));
assert.equal(invalid.errorCode, 'invalid-data');
assert.equal(invalid.takeDocument(), undefined);
invalid.free();

console.log(
  `PASS GDOC/WASM: ${golden.pages} pages, ${golden.glyphs} glyphs; every GPU byte and camera position matches the legacy decoder`
);
