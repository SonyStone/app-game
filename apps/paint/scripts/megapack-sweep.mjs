import { readAdobeBrushFixture } from '../../../scripts/adobe-brush-fixture.mjs';
import { chromium } from '@playwright/test';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

/*
 * Megapack brush sweep: one long pen stroke per preset and zoom through the production paint worker.
 *
 *   node scripts/megapack-sweep.mjs --cdp http://127.0.0.1:9224 --port 3047 \
 *     [--zooms 0.1,0.25,0.6,1.5] [--presets 0-464 | 3,17,40] [--paced] [--output FILE.jsonl]
 *
 * Starts its own Paint dev server (no file watching) on --port, which also serves the cached Megapack: a second
 * origin would need Chrome's local-network permission on the tablet. With --cdp it opens a tab in the tablet's
 * Chrome, which must reach that port:
 *
 *   adb reverse tcp:3047 tcp:3047
 *   adb forward tcp:9224 localabstract:chrome_devtools_remote
 *
 * Without --cdp it launches headless Chromium with WebGPU; keep that to a few presets for debugging the harness.
 *
 * --quality LODS (for example --quality 1,2) measures appearance instead of speed: every preset draws one
 * stroke exactly, exactly with another seed and with adaptive quality at each LOD, and the strokes are compared at
 * the view's resolution (tests/performance/lodQuality.ts). It needs no tablet; run it headless.
 *
 * Rows are appended to --output (JSON lines, default under the OS temporary directory) after every preset. Presets
 * measured in the same mode (speed or --quality) without an error are skipped, so an interrupted sweep resumes by
 * running the same command again, and presets that failed are retried. A crashed tab is reopened and the preset that
 * crashed it is recorded as an error. Exits non-zero when every preset measured in this run failed.
 */
const paintRoot = fileURLToPath(new URL('..', import.meta.url));
const repositoryRoot = path.resolve(paintRoot, '../..');

const { values } = parseArgs({
  options: {
    cdp: { type: 'string' },
    port: { type: 'string', default: '3047' },
    fixture: { type: 'string', default: 'megapack.abr' },
    zooms: { type: 'string', default: '0.1,0.25,0.6,1.5' },
    presets: { type: 'string' },
    distance: { type: 'string', default: '4000' },
    speed: { type: 'string', default: '1600' },
    timeout: { type: 'string', default: '60000' },
    paced: { type: 'boolean', default: false },
    quality: { type: 'string' },
    output: { type: 'string' }
  }
});

const output = path.resolve(values.output ?? path.join(os.tmpdir(), 'paint-megapack-sweep', `${Date.now()}.jsonl`));
if (isInside(output, repositoryRoot)) {
  throw new Error('--output must be outside the repository.');
}

await mkdir(path.dirname(output), { recursive: true });
const mode = values.quality ? 'quality' : 'speed';
const previous = (await readFile(output, 'utf8').catch(() => ''))
  .split('\n')
  .filter(Boolean)
  .map((line) => JSON.parse(line))
  .filter((row) => rowMode(row) === mode);
const failed = new Set(previous.filter((row) => row.error).map((row) => row.index));
const done = new Set(previous.map((row) => row.index).filter((index) => !failed.has(index)));

const fixture = await readAdobeBrushFixture(values.fixture);
const server = await startPaintServer(Number(values.port), fixture);
const baseUrl = `http://localhost:${values.port}`;
const fixtureUrl = `${baseUrl}/__fixture.abr`;
const browser = values.cdp
  ? await chromium.connectOverCDP(values.cdp)
  : await chromium.launch({
      headless: true,
      args: ['--enable-unsafe-webgpu', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])]
    });
let page;

try {
  let count = await openPage();
  const indices = selectPresets(values.presets, count).filter((index) => !done.has(index));
  let succeeded = 0;
  console.log(`${indices.length} presets to measure (${done.size} already in ${output})`);
  const options = {
    zooms: values.zooms.split(',').map(Number),
    screenDistance: Number(values.distance),
    penSpeed: Number(values.speed),
    paced: values.paced,
    timeoutMs: Number(values.timeout)
  };

  for (const index of indices) {
    let rows;
    try {
      rows = await page.evaluate(
        async ({ index, options, lods }) => {
          if (lods) {
            const { measureLodQuality } = await import('/tests/performance/lodQuality.ts');
            return measureLodQuality(undefined, { presets: [index], lods });
          }

          const { measureMegapackSweep } = await import('/tests/performance/megapackSweep.ts');
          const view = { width: innerWidth, height: innerHeight, dpr: devicePixelRatio };
          return measureMegapackSweep(undefined, { ...options, presets: [index], view });
        },
        { index, options, lods: values.quality?.split(',').map(Number) }
      );
    } catch (error) {
      // The tab crashed or the evaluation was lost; record it and continue in a fresh tab.
      rows = [{ index, name: '?', error: `page failure: ${error.message.split('\n')[0]}` }];
      await page.close().catch(() => {});
      count = await openPage();
    }

    await appendFile(output, rows.map((row) => JSON.stringify({ ...row, mode })).join('\n') + '\n');
    if (rows.some((row) => !row.error)) {
      succeeded++;
    }

    for (const row of rows) {
      if (values.quality) {
        console.log(
          row.adaptive
            ? `#${row.index} ${row.name} LOD ${row.lod}: ink ×${row.adaptive.ink.toFixed(3)}, difference ${row.adaptive.difference.toFixed(1)} (own variation ${row.reseeded.difference.toFixed(1)}), ${row.exactMs.toFixed(0)} -> ${row.adaptiveMs.toFixed(0)} ms`
            : `#${row.index} ${row.name} LOD ${row.lod}: ${row.error ? `ERROR ${row.error}` : row.skipped}`
        );
        continue;
      }

      console.log(
        row.error
          ? `#${row.index} ${row.name} @${row.zoom ?? '?'}: ERROR ${row.error}`
          : `#${row.index} ${row.name} @${row.zoom}: draw ${row.drawMs.toFixed(0)} ms (×${row.realTimeFactor.toFixed(2)}), finish ${row.finishMs.toFixed(0)} ms, gap ${row.maxFrameGapMs.toFixed(0)} ms, ${row.tiles} tiles`
      );
    }
  }

  console.log(`Wrote ${output}`);
  if (indices.length && !succeeded) {
    process.exitCode = 1;
  }
} finally {
  await page?.close().catch(() => {});
  // A CDP session belongs to the user's Chrome; only a launched browser is closed.
  if (!values.cdp) {
    await browser.close();
  }

  await server.close();
}

process.exit();

/** Whether a row measured speed or appearance; rows written before rows carried `mode` are told apart by `lod`. */
function rowMode(row) {
  return row.mode ?? ('lod' in row ? 'quality' : 'speed');
}

/** Opens the blank benchmark route, loads the library in the page and returns its preset count. */
async function openPage() {
  const context = values.cdp
    ? browser.contexts()[0]
    : await browser.newContext({ viewport: { width: 1280, height: 800 } });
  page = await context.newPage();
  page.on('pageerror', (error) => console.error(`pageerror: ${error.message}`));
  const url = `${baseUrl}/__megapack-sweep`;
  await page.route(url, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Megapack brush sweep</title>' })
  );
  await page.goto(url);
  return page.evaluate(async (fixtureUrl) => {
    if (!(await navigator.gpu?.requestAdapter())) {
      throw new Error('WebGPU unavailable. Unlock the tablet and leave Chrome visible.');
    }

    // Held for the page's lifetime so the tablet does not sleep mid-sweep.
    await navigator.wakeLock?.request('screen').catch(() => undefined);
    const { megapackPresetCount } = await import('/tests/performance/megapackSweep.ts');
    return megapackPresetCount(await (await fetch(fixtureUrl)).blob());
  }, fixtureUrl);
}

/**
 * Parses `a-b` ranges and comma-separated indices; every preset by default. Throws on a malformed part or an index
 * outside the library, rather than measuring nothing.
 */
function selectPresets(selection, count) {
  if (!selection) {
    return Array.from({ length: count }, (_, index) => index);
  }

  return selection.split(',').flatMap((part) => {
    const match = /^(\d+)(?:-(\d+))?$/.exec(part.trim());
    const from = Number(match?.[1]);
    const to = Number(match?.[2] ?? from);
    if (!match || from > to || to >= count) {
      throw new Error(`--presets part "${part}" must be an index or range within 0-${count - 1}.`);
    }

    return Array.from({ length: to - from + 1 }, (_, offset) => from + offset);
  });
}

/**
 * The Paint dev server without file watching, so edits made during a sweep never reload the page. It also serves
 * `fixture` at `/__fixture.abr`.
 */
async function startPaintServer(port, fixture) {
  const { createServer } = await import('vite');
  const server = await createServer({
    root: paintRoot,
    logLevel: 'warn',
    server: { host: '127.0.0.1', port, strictPort: true, hmr: false, watch: null },
    plugins: [
      {
        name: 'megapack-sweep-fixture',
        // Registered before Vite's own middlewares, whose HTML fallback would otherwise answer this path.
        configureServer(server) {
          server.middlewares.use('/__fixture.abr', (request, response) => {
            response.writeHead(200, {
              'content-type': 'application/octet-stream',
              'content-length': fixture.byteLength
            });
            response.end(fixture);
          });
        }
      }
    ]
  });
  await server.listen();
  return server;
}

function isInside(file, directory) {
  const relative = path.relative(directory, file);
  return !!relative && !relative.startsWith('..') && !path.isAbsolute(relative);
}
