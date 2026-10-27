// Reads recorded matches without the game (see src/koth/replay.harness.test.ts): what each came
// to, from its chronicle, and whether this code plays it the same, from its script.
//
//   pnpm replay <file.tanki-replay.json> [more files] [--json FILE]
//
// Relative paths are from apps/tanki; recordings saved from the dev server are in recordings/.
// Before playing, it tells whether this checkout is the code that played the match: a recording
// keeps its commit and, from the dev server, a .diff of the changes that were not committed.
// To play one on that very code, check the commit out in a worktree, `git apply` the diff there
// and run this from it.
//
// --json  writes the reports, with the replays' verdicts, to FILE as a JSON list.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const jsonAt = args.indexOf('--json');
const jsonFile = jsonAt >= 0 ? args.splice(jsonAt, 2)[1] : undefined;
const files = args.map((file) => resolve(app, file));

if (files.length === 0) {
  console.error('Usage: pnpm replay <file.tanki-replay.json> [more files] [--json FILE]');
  process.exit(1);
}

const head = git('rev-parse', 'HEAD');
const dirty = git('status', '--porcelain', '--', '.') !== '';

for (const file of files) {
  const { build } = JSON.parse(readFileSync(file, 'utf8'));
  const same = build.commit === head && !build.dirty && !dirty;
  const diff = build.diff && resolve(dirname(file), build.diff);
  console.log(
    same
      ? `${file}: recorded on this commit, ${head.slice(0, 8)}`
      : `${file}: recorded on ${build.commit.slice(0, 8)}${build.dirty ? ` with uncommitted changes (${diff}${existsSync(diff) ? '' : ', missing'})` : ''}; this checkout is ${head.slice(0, 8)}${dirty ? ' with uncommitted changes' : ''}`
  );
}

const output = await run(files);
const reports = output
  .split('\n')
  .filter((line) => line.startsWith('TANKI_REPORT '))
  .map((line) => JSON.parse(line.slice('TANKI_REPORT '.length)));
console.log(
  output
    .split('\n')
    .filter((line) => !line.startsWith('TANKI_REPORT ') && !/^\s*(RUN|✓|Test Files|Tests|Start at|Duration|stdout \|)/.test(line))
    .join('\n')
    .trim()
);

if (jsonFile) {
  writeFileSync(jsonFile, JSON.stringify(reports, null, 2));
}

/** Runs the harness on `files` and returns what it printed. */
function run(paths) {
  return new Promise((done, fail) => {
    const env = { ...process.env, TANKI_REPLAY: paths.join(',') };
    const child = spawn('pnpm', ['exec', 'vitest', 'run', 'src/koth/replay.harness.test.ts', '--reporter=verbose'], { cwd: app, env });
    let text = '';
    child.stdout.on('data', (chunk) => (text += chunk));
    child.stderr.on('data', (chunk) => (text += chunk));
    child.on('close', (code) => (code === 0 ? done(text) : fail(new Error(`The replay failed (exit ${code}):\n${text.slice(-3000)}`))));
  });
}

function git(...gitArgs) {
  return execFileSync('git', gitArgs, { cwd: app, encoding: 'utf8' }).trim();
}
