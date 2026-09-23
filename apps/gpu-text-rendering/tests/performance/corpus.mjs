import { chromium } from '@playwright/test';
import { execFileSync, spawn } from 'node:child_process';
import { createReadStream, writeFileSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeCorpusReport } from './corpusReport.mjs';

// Each PDF gets a separate Chrome process. A stalled GPU must not prevent testing subsequent documents.
const directory = process.argv[2];
const output = process.env.GPU_TEXT_OUTPUT ?? '/tmp/gpu-text-navigation-corpus';
const url = process.env.GPU_TEXT_URL ?? 'http://localhost:3180';
const files = (await readdir(directory)).filter((name) => /\.pdf$/i.test(name)).sort();
await mkdir(output, { recursive: true });

if (process.argv[3] === '--file') {
  await checkFile(Number(process.argv[4]));
} else {
  const results = [];
  for (const [index, name] of files.entries()) {
    if (process.env.GPU_TEXT_FILES && !process.env.GPU_TEXT_FILES.split(',').includes(String(index + 1))) {
      continue;
    }
    const destination = path.join(output, String(index + 1).padStart(2, '0'));
    await mkdir(destination, { recursive: true });
    console.log(`CORPUS ${index + 1}/${files.length} ${name}`);
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), directory, '--file', String(index)], {
      stdio: 'inherit',
      env: process.env
    });
    const timeout = setTimeout(() => terminateTree(child.pid), 600_000);
    const exit = await new Promise((resolve) => child.once('exit', resolve));
    clearTimeout(timeout);
    const result = await readFile(path.join(destination, 'navigation.json'), 'utf8').then(JSON.parse, () => ({
      name,
      failed: 'Process stopped before saving a report'
    }));
    results.push({ ...result, directory: String(index + 1).padStart(2, '0'), exit });
    await writeFile(path.join(output, 'report.json'), JSON.stringify(results, null, 2));
    await writeCorpusReport(output, results);
  }
  process.exitCode = results.some((result) => result.failed || result.exit !== 0) ? 1 : 0;
}

/** Checks actual PDF import first, then exercises the GDOC downloaded from that import through the same renderer. */
async function checkFile(index) {
  const name = files[index];
  const destination = path.join(output, String(index + 1).padStart(2, '0'));
  const report = {
    name,
    importChecked: process.env.GPU_TEXT_SKIP_IMPORT !== '1',
    scenarios: [],
    pageVisits: [],
    errors: []
  };
  const save = () => writeFile(path.join(destination, 'navigation.json'), JSON.stringify(report, null, 2));
  let { browser, page } = await openBrowser(report.errors);
  report.browser = browser.version();
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'Access-Control-Allow-Origin': '*' });
    const stream = createReadStream(path.join(destination, 'document.gdoc'));
    stream.on('error', () => response.destroy());
    response.on('close', () => stream.destroy());
    stream.pipe(response);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  let watchdog;
  const phase = async (label, action, timeout = 90_000) => {
    clearTimeout(watchdog);
    report.phase = label;
    await save();
    console.log(`CORPUS ${index + 1} ${label}`);
    watchdog = setTimeout(() => {
      report.failed = `Timed out during ${label} after ${timeout / 1000} seconds`;
      writeFileSync(path.join(destination, 'navigation.json'), JSON.stringify(report, null, 2));
      terminateTree(process.pid);
    }, timeout);
    const value = await action();
    clearTimeout(watchdog);
    return value;
  };
  try {
    if (process.env.GPU_TEXT_SKIP_IMPORT !== '1') {
      await page.goto(url);
      await page.getByRole('checkbox', { name: 'Auto zoom', exact: true }).uncheck();
      await page.waitForFunction(
        () =>
          document.querySelector('output')?.textContent?.startsWith('TypeGPU') &&
          document.querySelector('#beziercanvas')?.getAttribute('aria-busy') === 'false'
      );
      await page.evaluate(() => corpusDevice.queue.onSubmittedWorkDone());
      const started = Date.now();
      await phase(
        'PDF import',
        async () => {
          await page.evaluate(() => {
            let previous;
            new MutationObserver(() => {
              const message = document.querySelector('output')?.textContent;
              if (message !== previous) {
                previous = message;
                console.log('CORPUS UI', message);
              }
            }).observe(document.body, { subtree: true, childList: true, characterData: true });
          });
          await page.locator('input[type=file]').setInputFiles(path.join(directory, name));
          await page.getByText(name, { exact: true }).waitFor();
          await page.waitForFunction(
            () => document.querySelector('#beziercanvas')?.getAttribute('aria-busy') === 'false',
            undefined,
            { timeout: 300_000 }
          );
          report.open = await page.evaluate(() => ({
            message: document.querySelector('output')?.textContent,
            error: document.querySelector('[role=alert]')?.textContent
          }));
          report.openMs = Date.now() - started;
          if (report.open.error) {
            report.failed = report.open.error;
            return;
          }
          report.firstFrameMs = await phase('first frame completion', () =>
            page.evaluate(async () => {
              const start = performance.now();
              console.log('CORPUS first frame waiting for RAF');
              await new Promise(requestAnimationFrame);
              console.log('CORPUS first frame first RAF');
              await new Promise(requestAnimationFrame);
              console.log('CORPUS first frame waiting for GPU');
              await corpusDevice.queue.onSubmittedWorkDone();
              console.log('CORPUS first frame GPU complete');
              return performance.now() - start;
            })
          );
          await save();
          report.importStep = 'capture canvas';
          await save();
          const opened = await page.evaluate(() => document.querySelector('canvas').toDataURL());
          await writeFile(path.join(destination, 'opened.png'), Buffer.from(opened.split(',')[1], 'base64'));
          report.importStep = 'download GDOC';
          await save();
          const [download] = await Promise.all([
            page.waitForEvent('download', { timeout: 60_000 }),
            page.getByRole('link', { name: 'Download GDOC' }).click()
          ]);
          await download.saveAs(path.join(destination, 'document.gdoc'));
        },
        360_000
      );
    }
    if (report.failed) {
      return;
    }
    if (process.env.GPU_TEXT_SKIP_IMPORT !== '1') {
      report.uiNavigation = await phase('pointer navigation', async () => {
        const completed = [];
        await page.mouse.move(650, 550);
        for (const delta of [...Array(8).fill(600), ...Array(16).fill(-600), ...Array(8).fill(600)]) {
          await page.mouse.wheel(0, delta);
          completed.push(
            await page.evaluate(async () => {
              const start = performance.now();
              await new Promise(requestAnimationFrame);
              await new Promise(requestAnimationFrame);
              await corpusDevice.queue.onSubmittedWorkDone();
              return performance.now() - start;
            })
          );
        }
        await page.mouse.down();
        await page.mouse.move(850, 650, { steps: 15 });
        await page.mouse.up();
        await page.evaluate(() => corpusDevice.queue.onSubmittedWorkDone());
        return { steps: completed.length, maxCompletedMs: Math.max(...completed) };
      });
      await phase('close viewer', () => browser.close());
      ({ browser, page } = await openBrowser(report.errors));
    }
    await page.context().grantPermissions(['local-network-access'], { origin: url });
    await page.route('**/corpus-check', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<style>body{margin:0}canvas{width:100vw;height:100vh}</style>' })
    );
    await page.goto(`${url}/corpus-check`);
    report.renderer = await phase(
      'prepare navigation',
      () =>
        page.evaluate(async (input) => {
          const { prepareCorpusNavigation } = await import('/tests/performance/corpusHarness.ts');
          window.corpus = await prepareCorpusNavigation(input);
          return {
            pages: corpus.pages,
            width: corpus.width,
            height: corpus.height,
            overviewZoom: corpus.overviewZoom,
            adapter: window.corpusAdapter
          };
        }, `http://127.0.0.1:${server.address().port}/document.gdoc`),
      180_000
    );
    const profiler = process.env.GPU_TEXT_PROFILE ? await page.context().newCDPSession(page) : undefined;
    await profiler?.send('Profiler.enable');
    const overview = report.renderer.overviewZoom;
    for (const [label, zoom] of [
      ['overview', overview],
      ['far', 64],
      ['medium', overview * 0.25],
      ['page', 0.65],
      ['detail', 0.08],
      ['letter', 1 / 65536],
      ['rotate', 0.65],
      ['zoom-cycle', overview],
      ['overview-return', overview]
    ]) {
      if (label === 'overview') {
        await profiler?.send('Profiler.start');
      }
      const result = await phase(label, () =>
        page.evaluate(([name, zoom]) => corpus.measure(name, zoom), [label, zoom])
      );
      if (label === 'overview' && profiler) {
        const { profile } = await profiler.send('Profiler.stop');
        await writeFile(path.join(destination, 'overview.cpuprofile'), JSON.stringify(profile));
      }
      report.scenarios.push(result);
      await save();
      if (['overview', 'page', 'letter'].includes(label)) {
        const png = await phase(`${label} capture`, () => page.evaluate(() => corpus.screenshot()));
        await writeFile(path.join(destination, `${label}.png`), Buffer.from(png.split(',')[1], 'base64'));
      }
    }
    await phase(
      'page sweep',
      async () => {
        for (let pageIndex = 0; pageIndex < report.renderer.pages; pageIndex++) {
          const result = await page.evaluate((index) => corpus.visit(index), pageIndex);
          report.pageVisits.push(result);
          if (pageIndex % 50 === 0) {
            await save();
            console.log(`CORPUS ${index + 1} page ${pageIndex + 1}/${report.renderer.pages}`);
          }
        }
      },
      180_000
    );
    const screenshot = await phase('capture', () => page.evaluate(() => corpus.screenshot()));
    await writeFile(path.join(destination, 'last-page.png'), Buffer.from(screenshot.split(',')[1], 'base64'));
    report.phase = 'complete';
    report.failed = report.errors.length > 0 || report.scenarios.some((scenario) => scenario.errors.length > 0);
    await page.evaluate(() => corpus.destroy());
  } catch (error) {
    report.failed = String(error);
    console.error(name, error);
    process.exitCode = 1;
  } finally {
    clearTimeout(watchdog);
    await save();
    server.closeAllConnections();
    server.close();
    const closeStarted = Date.now();
    const shutdown = setTimeout(() => {
      report.failed ||= 'Browser cleanup exceeded 60 seconds';
      writeFileSync(path.join(destination, 'navigation.json'), JSON.stringify(report, null, 2));
      terminateTree(process.pid);
    }, 60_000);
    await browser.close();
    clearTimeout(shutdown);
    report.closeMs = Date.now() - closeStarted;
    await save();
  }
}

/** Kills only this runner and its descendants, including a GPU process stuck in browser shutdown. */
function terminateTree(root) {
  const rows = execFileSync('ps', ['-axo', 'pid=,ppid='], { encoding: 'utf8' })
    .trim()
    .split('\n')
    .map((row) => row.trim().split(/\s+/).map(Number));
  const children = (pid) => rows.filter((row) => row[1] === pid).flatMap(([child]) => [...children(child), child]);
  for (const pid of [...children(root), root]) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // Processes may have exited between the snapshot and the kill.
    }
  }
}

/** Keeps renderer timing isolated from resources and GPU work owned by the import UI. */
async function openBrowser(errors) {
  const browser = await chromium.launch({
    channel: process.env.GPU_TEXT_BROWSER_CHANNEL ?? 'chrome',
    headless: process.env.GPU_TEXT_HEADED !== '1',
    args: ['--enable-unsafe-webgpu', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])]
  });
  const page = await browser.newPage({
    viewport: {
      width: Number(process.env.GPU_TEXT_WIDTH ?? 1920),
      height: Number(process.env.GPU_TEXT_HEIGHT ?? 1200)
    },
    deviceScaleFactor: Number(process.env.GPU_TEXT_DPR ?? 1)
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.text().startsWith('NAV ') || message.text().startsWith('CORPUS ')) {
      console.log(message.text());
    }
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  await page.addInitScript(() => {
    if (typeof GPUAdapter === 'undefined') {
      return;
    }
    const request = GPUAdapter.prototype.requestDevice;
    GPUAdapter.prototype.requestDevice = async function (...args) {
      const device = await request.apply(this, args);
      window.corpusDevice = device;
      window.corpusAdapter = {
        vendor: this.info.vendor,
        architecture: this.info.architecture,
        device: this.info.device,
        description: this.info.description
      };
      return device;
    };
  });
  await page.route('**/favicon.ico', (route) => route.fulfill({ status: 204 }));
  return { browser, page };
}
