/**
 * Updates app-game's synced copies of the PSD and ABR packages from the photoshop-formats repository.
 *
 * Usage: `pnpm sync:formats [--check] [--force] [--source DIR] [--ref REF]`
 *
 * photoshop-formats owns `@app-game/psd`, `@app-game/abr-parser`, `@app-game/abr-brush` and `@app-game/abr-paint`
 * together with the Rust crates their WASM modules are built from. app-game keeps a copy of each package at the same
 * path, so Paint, apps/web, worktrees and the Vercel build need nothing outside this repository. Change the packages in
 * photoshop-formats, commit there, then run this script and commit the result here.
 *
 * The copy is the package's tracked files at `REF` (default `HEAD`) of the source repository, taken with `git archive`,
 * so uncommitted source changes are never copied and the recorded commit describes the copy exactly. Each package gets a
 * `formats-sync.json` with that commit and the SHA-256 of every file. Before replacing a package the script compares it
 * with that record and stops if the copy was edited here, listing the files; `--force` overwrites them. `--check` only
 * reports edited and outdated copies and exits with 1 if there are any.
 *
 * The source defaults to `photoshop-formats` next to the main checkout (`~/1D/git/photoshop-formats`); `--source` or
 * the `PHOTOSHOP_FORMATS` environment variable override it.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

/** Packages copied from photoshop-formats, as paths shared by both repositories. */
const PACKAGES = ['packages/psd', 'packages/abr-parser', 'packages/abr-brush', 'packages/abr-paint'];

/** The record written into each copied package. */
const RECORD = 'formats-sync.json';

const repositoryRoot = git(['rev-parse', '--show-toplevel']);
const mainRoot = dirname(git(['rev-parse', '--path-format=absolute', '--git-common-dir']));

/** Checks or updates every package and exits with 1 when something needs attention. */
function main() {
  const { values } = parseArgs({
    options: {
      check: { type: 'boolean', default: false },
      force: { type: 'boolean', default: false },
      source: { type: 'string' },
      ref: { type: 'string', default: 'HEAD' }
    }
  });
  const source = resolve(values.source ?? process.env.PHOTOSHOP_FORMATS ?? join(dirname(mainRoot), 'photoshop-formats'));

  if (!existsSync(join(source, '.git'))) {
    fail(`No photoshop-formats checkout at ${source}; pass --source or set PHOTOSHOP_FORMATS.`);
  }

  const commit = git(['-C', source, 'rev-parse', `${values.ref}^{commit}`]);
  let attention = false;

  for (const path of PACKAGES) {
    const edited = editedFiles(path);
    const current = readRecord(path)?.tree === git(['-C', source, 'rev-parse', `${commit}:${path}`]);

    if (values.check) {
      report(path, edited, current);
      attention ||= edited.length > 0 || !current;
      continue;
    }

    if (edited.length > 0 && !values.force) {
      report(path, edited, current);
      attention = true;
      continue;
    }

    warnAboutUncommittedSource(source, path);
    const manifestChanged = copyPackage(source, commit, path);
    globalThis.console.log(`${path}: synced from photoshop-formats ${commit.slice(0, 10)}`);

    if (manifestChanged) {
      globalThis.console.log(`${path}: package.json changed; run pnpm install`);
    }
  }

  if (attention) {
    globalThis.console.error(
      values.check
        ? 'Some copies differ from photoshop-formats; see above.'
        : 'Edited copies were left as they are: move the edits to photoshop-formats, or pass --force to discard them.'
    );
    process.exitCode = 1;
  }
}

/**
 * Lists the files of a copied package that differ from its last sync record: changed, added (tracked or untracked but
 * not ignored) or deleted. A package without a record counts as entirely edited, so the first sync needs `--force`.
 *
 * @param {string} path Package path.
 * @returns {string[]} Package-relative paths.
 */
function editedFiles(path) {
  const record = readRecord(path);
  const present = git(['ls-files', '--cached', '--others', '--exclude-standard', '--', path])
    .split('\n')
    .filter((file) => file && existsSync(join(repositoryRoot, file)))
    .map((file) => file.slice(path.length + 1))
    .filter((file) => file !== RECORD);

  if (!record) {
    return present.length > 0 ? ['(no formats-sync.json yet)'] : [];
  }

  const edited = present.filter((file) => record.files[file] !== hashFile(join(repositoryRoot, path, file)));
  const deleted = Object.keys(record.files).filter((file) => !present.includes(file));
  return [...edited, ...deleted.map((file) => `${file} (deleted)`)];
}

/**
 * Replaces a package with its tracked files at `commit` of the source and writes its record. Files of the previous copy
 * that the new one lacks are deleted; ignored files (node_modules, test output) are left alone.
 *
 * @param {string} source Source repository.
 * @param {string} commit Full source commit.
 * @param {string} path Package path.
 * @returns {boolean} Whether `package.json` changed.
 */
function copyPackage(source, commit, path) {
  const staging = mkdtempSync(join(tmpdir(), 'sync-formats-'));

  try {
    execFileSync('sh', ['-c', 'git -C "$1" archive "$2" -- "$3" | tar -x -C "$4"', 'sh', source, commit, path, staging]);
    const files = git(['-C', source, 'ls-tree', '-r', '--name-only', commit, '--', path])
      .split('\n')
      .filter(Boolean)
      .map((file) => file.slice(path.length + 1));
    const target = join(repositoryRoot, path);
    const previous = readRecord(path)?.files ?? {};
    const manifestBefore = hashOrUndefined(join(target, 'package.json'));

    for (const file of Object.keys(previous)) {
      if (!files.includes(file)) {
        rmSync(join(target, file), { force: true });
      }
    }

    for (const file of files) {
      const from = join(staging, path, file);
      const to = join(target, file);
      mkdirSync(dirname(to), { recursive: true });
      copyFileSync(from, to);
      chmodSync(to, statSync(from).mode);
    }

    const record = {
      note: 'Synced copy of photoshop-formats; edit it there and run `pnpm sync:formats` (scripts/sync-formats.mjs).',
      repository: 'photoshop-formats',
      commit,
      tree: git(['-C', source, 'rev-parse', `${commit}:${path}`]),
      files: Object.fromEntries(files.map((file) => [file, hashFile(join(target, file))]))
    };
    writeFileSync(join(target, RECORD), `${JSON.stringify(record, null, 2)}\n`);
    return manifestBefore !== hashOrUndefined(join(target, 'package.json'));
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

/**
 * Prints the state of one package.
 *
 * @param {string} path Package path.
 * @param {string[]} edited Files edited here since the last sync.
 * @param {boolean} current Whether the copy matches the requested source commit.
 */
function report(path, edited, current) {
  if (edited.length > 0) {
    globalThis.console.error(`${path}: edited here since the last sync:\n  ${edited.join('\n  ')}`);
  }

  globalThis.console.log(`${path}: ${current ? 'matches' : 'differs from'} the requested photoshop-formats commit`);
}

/**
 * Warns when the source has uncommitted changes in a package; they are not copied.
 *
 * @param {string} source Source repository.
 * @param {string} path Package path.
 */
function warnAboutUncommittedSource(source, path) {
  if (git(['-C', source, 'status', '--porcelain', '--', path])) {
    globalThis.console.warn(`${path}: photoshop-formats has uncommitted changes here; only committed files are copied.`);
  }
}

/**
 * Reads a package's sync record.
 *
 * @param {string} path Package path.
 * @returns {{ commit: string, tree: string, files: Record<string, string> } | undefined}
 */
function readRecord(path) {
  const file = join(repositoryRoot, path, RECORD);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : undefined;
}

/**
 * @param {string} file
 * @returns {string} Hex SHA-256 of the file's bytes.
 */
function hashFile(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

/**
 * @param {string} file
 * @returns {string | undefined} The file's hash, or undefined when it does not exist.
 */
function hashOrUndefined(file) {
  return existsSync(file) ? hashFile(file) : undefined;
}

/**
 * Runs git and returns its trimmed stdout.
 *
 * @param {string[]} args
 * @returns {string}
 */
function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
}

/**
 * Prints a message and exits with 1.
 *
 * @param {string} message
 * @returns {never}
 */
function fail(message) {
  globalThis.console.error(message);
  process.exit(1);
}

main();
