import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import type { Plugin } from 'vite';
import { formatRecording, RECORDING_EXTENSION } from './src/koth/recordingFile';

const run = promisify(execFile);

/**
 * Saves Tanki's match recordings during `vite dev` (see `src/koth/saveRecording.ts`). Both dev
 * servers that serve the game register it: this app's own and the web playground's (the
 * repository's `vite.config.ts`). Recordings always go to this app's `recordings/` folder, which
 * `pnpm worktree:setup` links to the main checkout's, so every worktree sees them.
 *
 * `PUT /__tanki/recordings/<name>.tanki-replay.json` writes the recording in the body to
 * `recordings/<name>.tanki-replay.json` and answers `{ path }`, relative to the repository. It
 * notes in the recording's `build` the commit the dev server runs and, when the app's code
 * differs from it, the file next to it that holds the difference, `<name>.diff`, as `git diff`
 * prints it, new files included: the dev server's code is often not committed, and a replay
 * needs the very code that played the match. Names are limited to letters, digits, `.`, `_` and `-`.
 */
export function recordingBridge(): Plugin {
  const root = fileURLToPath(new URL('./recordings/', import.meta.url));
  const app = fileURLToPath(new URL('./', import.meta.url));
  const repository = fileURLToPath(new URL('../../', import.meta.url));

  return {
    name: 'tanki-recording-bridge',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__tanki/recordings', async (request, response) => {
        const [, name] = /^\/([\w.-]+)$/.exec(request.url ?? '') ?? [];

        if (request.method !== 'PUT' || !name || name.startsWith('.') || !name.endsWith(RECORDING_EXTENSION)) {
          response.statusCode = 400;
          response.end(`Expected PUT /__tanki/recordings/<name>${RECORDING_EXTENSION}.`);
          return;
        }

        try {
          const chunks: Buffer[] = [];

          for await (const chunk of request) {
            chunks.push(chunk as Buffer);
          }

          const recording = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          const stem = name.slice(0, -RECORDING_EXTENSION.length);
          const { commit, diff } = await codeState(repository, app);
          recording.build = diff ? { commit, dirty: true, diff: `${stem}.diff` } : { commit };
          await mkdir(root, { recursive: true });

          if (diff) {
            await writeFile(`${root}${stem}.diff`, diff);
          }

          await writeFile(`${root}${name}`, formatRecording(recording));
          const path = relative(repository, `${root}${name}`);
          server.config.logger.info(`Saved Tanki recording ${path}`);
          response.setHeader('content-type', 'application/json');
          response.end(JSON.stringify({ path }));
        } catch (error) {
          response.statusCode = 500;
          response.end(String(error));
        }
      });
    }
  };
}

/**
 * The commit checked out in `repository` and how the app's folder `app` differs from it: the
 * changes to tracked files and the new files, as a patch `git apply` takes; empty when none.
 */
async function codeState(repository: string, app: string) {
  const git = async (...args: string[]) => (await run('git', args, { cwd: repository, maxBuffer: 64 * 1024 * 1024 })).stdout;
  const folder = relative(repository, app);
  const commit = (await git('rev-parse', 'HEAD')).trim();
  const changed = await git('diff', '--binary', 'HEAD', '--', folder);
  const added = (await git('ls-files', '--others', '--exclude-standard', '--', folder)).split('\n').filter(Boolean);
  // `git diff` leaves new files out; compared with nothing, each prints as a patch that creates it.
  const created = await Promise.all(added.map((file) => run('git', ['diff', '--binary', '--no-index', '/dev/null', file], { cwd: repository }).then(
    (result) => result.stdout,
    // It exits with 1 when the files differ, as they always do here.
    (error: { stdout?: string }) => error.stdout ?? ''
  )));
  return { commit, diff: changed + created.join('') };
}
