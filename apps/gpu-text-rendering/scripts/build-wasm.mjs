import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { writeWasmNotices } from './wasm-notices.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const crate = `${root}rust/document-format`;

/**
 * Builds both WASM modules (GDOC decoder and PDF importer) into `src/features/document/{format,pdf}/wasm`.
 *
 * `--check` only reports whether the pinned toolchain, wasm-bindgen and optional wasm-opt are available,
 * without building or writing files. Set `WASM_OPT=0` to skip optimization even when wasm-opt is installed.
 */
const checkOnly = process.argv.includes('--check');

const version = toolVersion('wasm-bindgen');
const optimizer = process.env.WASM_OPT === '0' ? undefined : toolVersion('wasm-opt');

if (checkOnly) {
  console.log(`cargo +1.92.0: ${toolVersion('cargo', ['+1.92.0', '--version']) ?? 'missing'}`);
  console.log(`wasm-bindgen: ${version ?? 'missing'} (required: wasm-bindgen 0.2.100)`);
  console.log(`wasm-opt: ${optimizer ?? 'missing or disabled (optional)'}`);
  process.exit(version === 'wasm-bindgen 0.2.100' ? 0 : 1);
}

if (version !== 'wasm-bindgen 0.2.100') {
  console.error('Install the matching generator: cargo install wasm-bindgen-cli --version 0.2.100 --locked');
  process.exit(1);
}

if (!optimizer) {
  console.warn('wasm-opt not found (or WASM_OPT=0); skipping Binaryen optimization. Install binaryen to shrink the modules.');
}

// The decoder favors speed; the much larger PDF importer favors download size.
for (const [features, directory, level] of [
  ['wasm', 'format', '-O3'],
  ['wasm,pdf', 'pdf', '-Oz']
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

  if (optimizer) {
    const wasm = `${output}/gpu_document_bg.wasm`;
    // Rust 1.92's wasm32 defaults use these post-MVP features; Binaryen must accept, not add, them.
    execFileSync(
      'wasm-opt',
      [
        level,
        '--enable-bulk-memory',
        '--enable-mutable-globals',
        '--enable-nontrapping-float-to-int',
        '--enable-reference-types',
        '--enable-multivalue',
        '--enable-sign-ext',
        wasm,
        '-o',
        wasm
      ],
      { stdio: 'inherit' }
    );
  }
}

writeWasmNotices(crate, `${root}src/features/document/pdf/wasm/third-party-notices.txt`);

/** Returns the trimmed `--version` output of `command`, or undefined when it is not installed. */
function toolVersion(command, args = ['--version']) {
  try {
    return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return undefined;
  }
}
