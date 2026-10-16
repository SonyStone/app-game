import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

/**
 * Keeps the pages built in the component canvas's constructor in this app's `src/variants/layouts/<id>.json` during
 * `vite dev`, where the variant registry finds them (see `variants/layout`), so that a built page becomes a variant
 * and is committed with the code. Both dev servers that serve the canvas register it: this app's own and the web
 * playground's.
 *
 * `GET /__paint-layouts` answers every saved page as `{ [id]: layout }`. `PUT /__paint-layouts/<id>` writes the page
 * `<id>` (lowercase letters, digits and hyphens, at most 40) from the request body, a JSON object of at most 256 KiB,
 * and answers `{ id, file }`, the file relative to the repository. The file is written beside and renamed over, so a
 * reader never sees half of it. The registry checks the page's shape when it reads the file. The folder is watched,
 * so a saved page reaches the registry without a restart.
 */
export function layoutsBridge(): Plugin {
  const folder = fileURLToPath(new URL('./src/variants/layouts/', import.meta.url));
  const repository = fileURLToPath(new URL('../../', import.meta.url));

  return {
    name: 'paint-layouts-bridge',
    apply: 'serve',
    async configureServer(server) {
      // The folder lies outside the playground's root, so Vite would not see a new page and refresh the registry's
      // `import.meta.glob`; watched, a saved page reaches the registry at once.
      await mkdir(folder, { recursive: true });
      server.watcher.add(folder);

      server.middlewares.use('/__paint-layouts', async (request, response) => {
        response.setHeader('content-type', 'application/json');
        const id = (request.url ?? '/').replace(/^\/+|\/+$/g, '');

        if (request.method === 'GET' && !id) {
          const files = await readdir(folder).catch(() => [] as string[]);
          const layouts: Record<string, unknown> = {};
          for (const file of files.filter((name) => name.endsWith('.json'))) {
            try {
              layouts[file.slice(0, -'.json'.length)] = JSON.parse(await readFile(`${folder}${file}`, 'utf8'));
            } catch {
              // A file that does not parse is no page.
            }
          }

          response.end(JSON.stringify(layouts));
          return;
        }

        if (request.method !== 'PUT' || !/^[a-z0-9-]{1,40}$/.test(id)) {
          response.statusCode = request.method === 'PUT' ? 400 : 405;
          response.end(JSON.stringify({ error: 'Expected GET /__paint-layouts or PUT /__paint-layouts/<id>.' }));
          return;
        }

        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of request) {
          size += (chunk as Buffer).byteLength;
          if (size > maxBytes) {
            response.statusCode = 413;
            response.end(JSON.stringify({ error: 'A page is limited to 256 KiB.' }));
            return;
          }

          chunks.push(chunk as Buffer);
        }

        let layout: unknown;
        try {
          layout = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } catch {
          layout = undefined;
        }

        if (typeof layout !== 'object' || layout === null || Array.isArray(layout)) {
          response.statusCode = 400;
          response.end(JSON.stringify({ error: 'Expected a JSON object.' }));
          return;
        }

        const file = `${folder}${id}.json`;
        await mkdir(folder, { recursive: true });
        await writeFile(`${file}.tmp`, `${JSON.stringify(layout, null, 2)}\n`);
        await rename(`${file}.tmp`, file);
        response.end(JSON.stringify({ id, file: relative(repository, file) }));
      });
    }
  };
}

const maxBytes = 256 * 1024;
