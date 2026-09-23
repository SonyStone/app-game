import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { writeWasmNotices } from './wasm-notices.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const crate = `${root}rust/document-format`;

const version = execFileSync('wasm-bindgen', ['--version'], { encoding: 'utf8' }).trim();

if (version !== 'wasm-bindgen 0.2.100') {
  console.error('Install the matching generator: cargo install wasm-bindgen-cli --version 0.2.100 --locked');
  process.exit(1);
}

for (const [features, directory] of [
  ['wasm', 'format'],
  ['wasm,pdf', 'pdf']
]) {
  const output = `${root}src/features/document/${directory}/wasm`;
  execFileSync(
    'cargo',
    [
      '+1.92.0',
      'build',
      '--manifest-path',
      `${crate}/Cargo.toml`,
      '--locked',
      '--lib',
      '--release',
      '--target',
      'wasm32-unknown-unknown',
      '--features',
      features
    ],
    { stdio: 'inherit' }
  );

  mkdirSync(output, { recursive: true });

  execFileSync(
    'wasm-bindgen',
    [
      `${crate}/target/wasm32-unknown-unknown/release/gpu_document.wasm`,
      '--target',
      'web',
      '--out-dir',
      output,
      '--out-name',
      'gpu_document'
    ],
    { stdio: 'inherit' }
  );
}

writeWasmNotices(crate, `${root}src/features/document/pdf/wasm/third-party-notices.txt`);
