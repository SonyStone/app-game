import { readAdobeBrushFixture } from '../../../scripts/adobe-brush-fixture.mjs';
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer as createHttpServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { compareBrushPerformance } from './compare-brush-performance.mjs';

/*
 * Brush timing benchmark.
 *
 * Without --cdp it launches headless Chromium with WebGPU and, unless --url is given, its own Paint Vite dev server:
 * useful for local A/B comparisons, not comparable with tablet baselines. With --cdp it attaches to a tablet's Chrome
 * and expects the Paint dev server at --url (default http://localhost:3030).
 *
 * The result JSON is always written to --output, or to a timestamped file under the OS temporary directory.
 * --output must be outside the repository; --record may write inside it only under performance/baselines.
 */

// Module paths are declared before the top-level run uses them.
const paintRoot = fileURLToPath(new URL('..', import.meta.url));
const repositoryRoot = path.resolve(paintRoot, '../..');
const baselineDirectory = path.join(paintRoot, 'performance', 'baselines');

const { values } = parseArgs({ options: {
  cdp: { type: 'string' }, url: { type: 'string' },
  device: { type: 'string' }, record: { type: 'string' }, baseline: { type: 'string' }, output: { type: 'string' },
  verify: { type: 'boolean', default: false }
} });

if (values.cdp && !values.device) {
  throw new Error('--cdp requires --device NAME, for example --device movinkpad-pro14.');
}

if (values.record && values.baseline) {
  throw new Error('Use at most one of --record FILE or --baseline FILE.');
}

const output = path.resolve(values.output ?? defaultOutputPath());
assertOutsideRepository(output, '--output');
const record = values.record && path.resolve(values.record);
if (record && isInside(record, repositoryRoot) && !isInside(record, baselineDirectory)) {
  throw new Error(`--record inside the repository must be under ${path.relative(process.cwd(), baselineDirectory)}.`);
}

const fixture = await readAdobeBrushFixture('megapack.abr');
const session = values.cdp
  ? await attachToTablet(values.cdp, values.url, fixture)
  : await launchHeadless(values.url, fixture);
try {
  const result = await measure(session, { verify: values.verify, headless: !values.cdp });
  result.environment.device = values.device ?? `headless-${process.platform}-${os.arch()}`;
  result.recordedAt = new Date().toISOString();
  result.commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  result.dirty = !!execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim();
  const json = JSON.stringify(result, null, 2) + '\n';
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, json);
  console.log(`Wrote ${output}`);

  if (record) {
    // Never silently replace an accepted baseline with slower results.
    await writeFile(record, json, { flag: 'wx' });
    console.log(`Recorded ${record}; visually review changed brush output before accepting a new baseline.`);
  } else if (values.baseline) {
    const { failures, warnings } = compareBrushPerformance(JSON.parse(await readFile(values.baseline, 'utf8')), result);
    for (const warning of warnings) {
      console.warn(`Warning: ${warning}`);
    }

    if (failures.length) {
      throw new Error(failures.join('\n'));
    }

    console.log('Brush performance baseline passed.');
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await session.close();
}
process.exit(process.exitCode ?? 0);

/**
 * Runs the benchmark module in the session's page. The page is a blank route on the Paint dev server so that Vite
 * serves the benchmark module; the session serves the cached Megapack at `fixtureUrl` instead of fetching it from
 * Adobe. The tablet run requires a screen wake lock; headless runs use it only when available.
 */
async function measure({ page, url: baseUrl, fixtureUrl }, { verify, headless }) {
  page.on('crash', () => console.error('The benchmark tab crashed.'));
  page.on('pageerror', error => console.error(error));
  page.on('console', message => {
    if (message.type() === 'error') {
      console.error(message.text());
    }
  });
  const url = new URL('/__brush-performance', baseUrl).href;
  await page.route(url, route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Brush performance checks</title>' }));
  await page.goto(url);
  await page.exposeFunction('reportBrushPerformance', message => console.log(message));
  return await page.evaluate(async ({ verify, headless, fixtureUrl }) => {
    const adapter = await navigator.gpu?.requestAdapter();
    if (!adapter) {
      throw new Error(headless
        ? 'WebGPU unavailable in headless Chromium.'
        : 'WebGPU unavailable. Unlock the tablet and leave Chrome visible.');
    }

    const lock = headless
      ? await navigator.wakeLock?.request('screen').catch(() => undefined)
      : await navigator.wakeLock.request('screen');
    try {
      const { measureBrushPerformance, verifyBrushPerformanceOutput } = await import('/tests/performance/brushPerformance.ts');
      if (verify) {
        await verifyBrushPerformanceOutput(message => window.reportBrushPerformance(message));
      }

      const { vendor, architecture, device, description } = adapter.info;
      return { schema: 1, environment: {
        userAgent: navigator.userAgent, dpr: devicePixelRatio, width: innerWidth, height: innerHeight,
        gpu: { vendor, architecture, device, description }
      }, cases: await measureBrushPerformance(message => window.reportBrushPerformance(message), await (await fetch(fixtureUrl)).blob()) };
    } finally {
      await lock?.release();
    }
  }, { verify, headless, fixtureUrl });
}

/**
 * Opens a test tab in the tablet's Chrome and routes the fixture over CDP, since the tablet cannot reach host ports
 * other than the reversed dev server. Closing detaches without `browser.close()`, which would end the user's session.
 */
async function attachToTablet(cdp, url = 'http://localhost:3030', fixture) {
  const browser = await chromium.connectOverCDP(cdp);
  const page = await browser.contexts()[0].newPage();
  const fixtureUrl = new URL('/__megapack.abr', url).href;
  await page.route(fixtureUrl, route => route.fulfill({ contentType: 'application/octet-stream', body: fixture }));
  return { page, url, fixtureUrl, close: () => page.close() };
}

/**
 * Launches headless Chromium with WebGPU and, without `url`, a Paint dev server on a free port. The fixture is served
 * over loopback HTTP because a launched browser's DevTools pipe cannot carry a response body larger than 100 MB.
 * Closing stops the browser and both servers.
 */
async function launchHeadless(url, fixture) {
  const fixtureServer = await serveFixture(fixture);
  const server = url ? undefined : await startPaintServer().catch(async error => {
    fixtureServer.close();
    throw error;
  });
  try {
    const browser = await chromium.launch({
      headless: true,
      args: ['--enable-unsafe-webgpu', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])]
    });
    // Chrome blocks the loopback fixture fetch unless local network access is granted.
    const page = await browser.newPage({ permissions: ['local-network-access'] });
    const baseUrl = url ?? `http://127.0.0.1:${server.httpServer.address().port}`;
    const fixtureUrl = `http://127.0.0.1:${fixtureServer.address().port}/megapack.abr`;
    return {
      page,
      url: baseUrl,
      fixtureUrl,
      close: async () => {
        await browser.close();
        await server?.close();
        fixtureServer.close();
      }
    };
  } catch (error) {
    await server?.close();
    fixtureServer.close();
    throw error;
  }
}

/** Serves `fixture` to any origin on an OS-assigned loopback port. */
async function serveFixture(fixture) {
  const server = createHttpServer((request, response) => {
    response.writeHead(200, { 'content-type': 'application/octet-stream', 'access-control-allow-origin': '*' });
    response.end(fixture);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return server;
}

/** Starts the Paint Vite dev server with its own config on an OS-assigned loopback port. */
async function startPaintServer() {
  const { createServer } = await import('vite');
  const server = await createServer({
    root: paintRoot,
    logLevel: 'warn',
    server: { host: '127.0.0.1', port: 0, strictPort: true }
  });
  await server.listen();
  return server;
}

/** A timestamped result file under the OS temporary directory, so default runs never touch the repository. */
function defaultOutputPath() {
  const timestamp = new Date().toISOString().replaceAll(':', '-');
  return path.join(os.tmpdir(), 'paint-brush-performance', `${timestamp}.json`);
}

/** Throws when `file` is inside the repository; result files are local artifacts, not sources. */
function assertOutsideRepository(file, option) {
  if (isInside(file, repositoryRoot)) {
    throw new Error(`${option} must be outside the repository; use --record ${path.relative(process.cwd(), baselineDirectory)}/NAME.json to add a baseline.`);
  }
}

function isInside(file, directory) {
  const relative = path.relative(directory, file);
  return !!relative && !relative.startsWith('..') && !path.isAbsolute(relative);
}
