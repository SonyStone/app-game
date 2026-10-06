/**
 * Prepares a linked git worktree of this repository so an agent can build, test and run apps in it.
 *
 * Usage: `pnpm worktree:setup` (or `node scripts/worktree-setup.mjs`) from anywhere inside the worktree. T3 Code runs it
 * automatically for new worktree threads through `t3.json`.
 *
 * A fresh worktree has only tracked files. This script installs dependencies from the shared pnpm store, links local
 * data the main checkout keeps outside git, copies the few gitignored build outputs that other packages import, and points
 * Cargo's intermediate files at the main checkout, so Rust is not rebuilt from scratch in every worktree.
 * Steps that are already done are skipped, so it is safe to run again. In the main checkout it does nothing.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const worktreeRoot = git(['rev-parse', '--show-toplevel']);
const mainRoot = dirname(git(['rev-parse', '--path-format=absolute', '--git-common-dir']));

/** Sets up the worktree, or does nothing in the main checkout. */
function main() {
  if (worktreeRoot === mainRoot) {
    globalThis.console.log('This is the main checkout; worktree setup is not needed.');
    return;
  }

  globalThis.console.log(`Setting up worktree ${worktreeRoot} (main checkout: ${mainRoot})`);

  installDependencies();

  for (const path of SHARED_DATA) {
    linkSharedData(path);
  }

  for (const path of BUILD_OUTPUTS) {
    copyBuildOutput(path);
  }

  shareRustBuilds();

  globalThis.console.log('Worktree ready.');
}

/**
 * Runs a git command in the current directory.
 *
 * @param {string[]} args
 * @returns {string} Trimmed stdout.
 */
function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

/**
 * Installs the workspace from the lockfile. Packages come from the shared pnpm store as hard links, so this is fast
 * and takes little disk space even though every worktree has its own `node_modules`.
 */
function installDependencies() {
  globalThis.console.log('Installing dependencies…');
  execFileSync('pnpm', ['install', '--frozen-lockfile', '--prefer-offline'], { cwd: worktreeRoot, stdio: 'inherit' });
}

/**
 * Symlinks a gitignored data directory to the main checkout, so every worktree reads and writes the same files.
 *
 * @param {string} path Repository-relative path.
 */
function linkSharedData(path) {
  const source = join(mainRoot, path);
  const target = join(worktreeRoot, path);

  if (!existsSync(source) || isPresent(target)) {
    return;
  }

  mkdirSync(dirname(target), { recursive: true });
  symlinkSync(source, target);
  globalThis.console.log(`Linked ${path} → main checkout`);
}

/**
 * Copies a gitignored build output from the main checkout. On APFS the copy is a clone and takes no extra space. It is
 * a snapshot: rebuild the package in the worktree when its sources change there.
 *
 * @param {string} path Repository-relative path.
 */
function copyBuildOutput(path) {
  const source = join(mainRoot, path);
  const target = join(worktreeRoot, path);

  if (isPresent(target)) {
    return;
  }

  if (!existsSync(source)) {
    globalThis.console.warn(`Skipped ${path}: the main checkout has not built it either.`);
    return;
  }

  execFileSync('cp', ['-cR', source, target]);
  globalThis.console.log(`Copied ${path} from main checkout`);
}

/**
 * Writes a worktree-only `.cargo/config.toml` whose `build.build-dir` is the main checkout's PDF Panorama Rust target.
 * Compiled dependencies are then reused instead of rebuilt (a full build fills several gigabytes), while final artifacts
 * still land in the worktree's own `target/`, where the WASM build script reads them. Cargo locks the shared directory,
 * so builds from different worktrees wait for each other; the crate itself is recompiled when the last build came from
 * another checkout. Needs Cargo 1.91 or newer (the project pins `cargo +1.92.0`); older Cargo ignores the setting.
 */
function shareRustBuilds() {
  const config = join(worktreeRoot, '.cargo/config.toml');

  if (isPresent(config)) {
    return;
  }

  mkdirSync(dirname(config), { recursive: true });
  writeFileSync(
    config,
    `# Written by scripts/worktree-setup.mjs: Rust intermediates are shared with the main checkout.\n[build]\nbuild-dir = ${JSON.stringify(join(mainRoot, RUST_BUILD_DIR))}\n`
  );
  globalThis.console.log(`Shared Rust build directory: ${RUST_BUILD_DIR} in main checkout`);
}

/**
 * Tells whether a path exists, counting a symlink whose target is gone.
 *
 * @param {string} path
 * @returns {boolean}
 */
function isPresent(path) {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

/** Gitignored data directories shared by all worktrees. Their ignore patterns must not end in `/`, or git lists the symlinks. */
const SHARED_DATA = ['apps/paint/recordings'];

/** Gitignored build outputs that workspace packages export and that a fresh worktree lacks. */
const BUILD_OUTPUTS = ['packages/card-stack/dist', 'packages/solid-view-cube/dist'];

/** The main checkout's Cargo target that worktrees use as their build directory. */
const RUST_BUILD_DIR = 'apps/gpu-text-rendering/rust/document-format/target';

main();
