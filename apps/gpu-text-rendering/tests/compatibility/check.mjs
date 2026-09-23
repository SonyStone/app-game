import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Runs the corpus and checks known results without treating known PDF defects as conformance passes. */
const directory = process.argv[2];
assert.ok(directory, 'Usage: pnpm test:compatibility <external-corpus-directory>');
assert.ok(
  !process.env.GPU_TEXT_MANIFEST || process.env.GPU_TEXT_BASELINE,
  'A custom GPU_TEXT_MANIFEST requires its own GPU_TEXT_BASELINE'
);
const here = fileURLToPath(new URL('.', import.meta.url));
const output = path.resolve(process.env.GPU_TEXT_OUTPUT ?? path.join(directory, 'results'));
const commands = [
  [process.execPath, [path.join(here, 'run.browser.mjs'), directory]],
  [process.execPath, [path.join(here, 'pdfjs-reference.mjs'), directory]],
  [
    process.env.PYTHON ?? 'python3',
    [
      path.join(here, 'compare.py'),
      output,
      '--check',
      process.env.GPU_TEXT_BASELINE ?? path.join(here, 'baseline.json')
    ]
  ]
];

for (const [command, args] of commands) {
  const result = spawnSync(command, args, { stdio: 'inherit', env: process.env });

  if (result.status !== 0) {
    console.error(result.error?.message ?? `Compatibility check exited with ${result.status ?? result.signal}`);
    process.exitCode = 1;
    break;
  }
}
