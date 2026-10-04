import { mkdir, writeFile } from 'node:fs/promises';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

/**
 * Saves input recordings from the editor's recorder during `vite dev` (see `src/features/recording`). Both dev servers
 * that serve the editor register it: this app's own and the web playground's (the repository's `vite.config.ts`,
 * which `pnpm dev:tablet` runs). Recordings always go to this app's `recordings/` directory.
 *
 * `PUT /__recordings/<id>/<file>` writes the request body to `recordings/<id>/<file>` in this app and answers
 * `{ directory }`, relative to the repository. Ids and file names are limited to letters, digits, `.`, `_` and `-`.
 * Read a recording with `node scripts/recording-timeline.mjs recordings/<id>`.
 */
export function recordingBridge(): Plugin {
  const root = fileURLToPath(new URL('./recordings/', import.meta.url));
  const repository = fileURLToPath(new URL('../../', import.meta.url));

  return {
    name: 'paint-recording-bridge',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__recordings', async (request, response) => {
        const [, id, name] = /^\/([\w.-]+)\/([\w.-]+)$/.exec(request.url ?? '') ?? [];

        if (request.method !== 'PUT' || !id || !name || id.startsWith('.') || name.startsWith('.')) {
          response.statusCode = 400;
          response.end('Expected PUT /__recordings/<id>/<file>.');
          return;
        }

        const chunks: Buffer[] = [];

        for await (const chunk of request) {
          chunks.push(chunk as Buffer);
        }

        const directory = `${root}${id}`;
        await mkdir(directory, { recursive: true });
        await writeFile(`${directory}/${name}`, Buffer.concat(chunks));
        server.config.logger.info(`Saved recording file ${relative(repository, `${directory}/${name}`)}`);
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ directory: relative(repository, directory) }));
      });
    }
  };
}
