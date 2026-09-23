import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Downloads only pinned manifest inputs. Source PDFs stay outside the repository. */
const directory = process.argv[2];
assert.ok(directory, 'Usage: node tests/compatibility/fetch.mjs <external-corpus-directory>');
const manifest = JSON.parse(await readFile(new URL('./manifest.json', import.meta.url)));

for (const entry of manifest.cases) {
  const response = await fetch(entry.url, { signal: AbortSignal.timeout(60_000) });
  assert.ok(response.ok, `${entry.id}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256, `${entry.id}: source changed`);
  const destination = path.resolve(directory, entry.file);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, bytes);
  console.log(entry.id);
}
