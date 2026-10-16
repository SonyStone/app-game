import { readFile, rename, writeFile } from 'node:fs/promises';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

/**
 * Keeps the stars and comments of the component canvas (`src/component-canvas`) in this app's
 * `docs/component-choices.json` during `vite dev`, so that what the user picks there is committed with the spec. Both
 * dev servers that serve the canvas register it: this app's own and the web playground's.
 *
 * `GET /__component-choices` answers the file's JSON (`{}` while it does not exist). `PUT /__component-choices` replaces
 * it with the request body, which must be a JSON object of at most 1 MiB, and answers `{ file }`, relative to the
 * repository. The file is written beside and renamed over, so a reader never sees half of it.
 */
export function choicesBridge(): Plugin {
  const file = fileURLToPath(new URL('./docs/component-choices.json', import.meta.url));
  const repository = fileURLToPath(new URL('../../', import.meta.url));

  return {
    name: 'paint-component-choices-bridge',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__component-choices', async (request, response) => {
        response.setHeader('content-type', 'application/json');

        if (request.method === 'GET') {
          response.end(await readFile(file, 'utf8').catch(() => '{}'));
          return;
        }

        if (request.method !== 'PUT') {
          response.statusCode = 405;
          response.end(JSON.stringify({ error: 'Expected GET or PUT.' }));
          return;
        }

        const chunks: Buffer[] = [];
        let size = 0;

        for await (const chunk of request) {
          size += (chunk as Buffer).byteLength;
          if (size > maxBytes) {
            response.statusCode = 413;
            response.end(JSON.stringify({ error: 'Choices are limited to 1 MiB.' }));
            return;
          }

          chunks.push(chunk as Buffer);
        }

        let choices: unknown;
        try {
          choices = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } catch {
          choices = undefined;
        }

        if (typeof choices !== 'object' || choices === null || Array.isArray(choices)) {
          response.statusCode = 400;
          response.end(JSON.stringify({ error: 'Expected a JSON object.' }));
          return;
        }

        await writeFile(`${file}.tmp`, `${JSON.stringify(choices, null, 2)}\n`);
        await rename(`${file}.tmp`, file);
        response.end(JSON.stringify({ file: relative(repository, file) }));
      });
    }
  };
}

const maxBytes = 1024 * 1024;
