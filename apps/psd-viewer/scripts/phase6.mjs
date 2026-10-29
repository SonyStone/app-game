import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { loadavg } from 'node:os';
const require = createRequire(new URL('../package.json', import.meta.url));
const { chromium } = require('@playwright/test');
const out = process.env.PSD_BENCH_OUT;
if (!out) {
  throw new Error('Run through benchmark.mjs with PSD_BENCH_PHASE6=1.');
}
const fixture = `${process.env.PSD_TEXT_MIXER_RESEARCH_ROOT}/fixtures/psd/oracle-1/DVE__Enzymes__test__--1-e9610aa019d6-g0/source-input/document.psb`;
const results = [];
for (let run = 1; run <= Number(process.env.PSD_BENCH_RUNS ?? 3); run++) {
  // Alternate order so a changing research load does not always favor the same mode.
  for (const workers of run % 2 ? [1, 2] : [2, 1]) {
    const browser = await chromium.launch({
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      headless: true,
      args: ['--enable-unsafe-webgpu', '--disable-background-timer-throttling', '--disable-renderer-backgrounding']
    });
    const result = { run, workers, dpr: Number(process.env.PSD_BENCH_DPR ?? 1), loadBefore: loadavg(), errors: [] };
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: result.dpr });
      page.on('pageerror', (error) => result.errors.push(error.message));
      await page.addInitScript(() => {
        const a = window.__parallel = { phase: 'open', requests: [], replies: [], failures: [], samples: [], hashes: [], frames: [] };
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.name.startsWith('psd:')) {
              a.samples.push({ name: entry.name.slice(4), start: entry.startTime, ms: entry.duration, value: entry.detail, phase: a.phase });
            }
          }
        }).observe({ type: 'measure' });
        let last;
        const frame = (time) => {
          if (last) {
            a.frames.push({ ms: time - last, phase: a.phase });
          }
          last = time;
          requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
        let nextWorker = 0;
        const Native = Worker;
        window.Worker = class extends Native {
          constructor(...args) {
            super(...args);
            this.number = ++nextWorker;
            this.addEventListener('message', ({ data }) => {
              if (data.type === 'failed') {
                a.failures.push({ worker: this.number, id: data.id, error: String(data.error.message) });
              }
              if (data.type !== 'windowRendered') {
                return;
              }
              const phase = a.phase;
              const images = data.images.map(({ left, top, width, height, step, strategy, pixels }) => ({
                left, top, width, height, step, strategy,
                populated: pixels.some((value, index) => index % 4 === 3 && value !== 0)
              }));
              a.replies.push({ id: data.id, worker: this.number, time: performance.now(), ms: data.milliseconds, phase, images });
              if (phase === 'nine' || phase === 'large') {
                for (const image of data.images) {
                  for (const level of [image, ...(image.mips ?? [])]) {
                    // Native WebCrypto owns its input before worker transfers are consumed by the display.
                    a.hashes.push(crypto.subtle.digest('SHA-256', level.pixels).then((hash) => ({
                      phase, rectangle: [level.left, level.top, level.width, level.height, level.step],
                      hash: Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('')
                    })));
                  }
                }
              }
            });
          }
          postMessage(data, ...args) {
            if (data.type === 'renderWindow') {
              a.requests.push({ id: data.id, worker: this.number, time: performance.now(), window: data.window, phase: a.phase });
            }
            super.postMessage(data, ...args);
          }
        };
      });
      await page.goto(`${process.env.PSD_BENCH_URL}/?current=1&telemetry=1&workers=${workers}`);
      const settle = async () => {
        await page.waitForFunction(() => document.querySelector('[data-busy]')?.dataset.busy === 'false' && document.querySelector('canvas'), {}, { timeout: 120000 });
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      };
      await page.locator('input[accept=".psd,.psb"]').setInputFiles(fixture);
      await settle();
      await page.getByRole('button', { name: '100%', exact: true }).click();
      await settle();
      const stage = page.locator('[data-busy]');
      const bounds = await stage.boundingBox();
      const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
      const jump = async (phase, point) => {
        await page.mouse.move(center.x, center.y);
        await page.mouse.down();
        await page.evaluate(({ center, phase, point }) => {
          const stage = document.querySelector('[data-busy]');
          const scale = Number(stage.dataset.cameraScale);
          __parallel.phase = phase;
          __parallel.start = performance.now();
          stage.dispatchEvent(new PointerEvent('pointermove', {
            pointerId: 1, clientX: center.x - point.x * scale - Number(stage.dataset.cameraX),
            clientY: center.y - point.y * scale - Number(stage.dataset.cameraY), bubbles: true
          }));
        }, { center, phase, point });
        await page.mouse.up();
        await settle();
        return page.evaluate(() => performance.now() - __parallel.start);
      };
      result.ninePresentedMs = await jump('nine', { x: 4352, y: 7424 });
      await page.screenshot({ path: `${out}/assets/phase6-r${run}-w${workers}-dpr${result.dpr}.png` });
      await page.mouse.move(center.x, center.y);
      await page.mouse.down();
      await page.evaluate(async ({ center }) => {
        __parallel.phase = 'gesture';
        const stage = document.querySelector('[data-busy]');
        for (let frame = 0; frame < 240; frame++) {
          await new Promise(requestAnimationFrame);
          stage.dispatchEvent(new PointerEvent('pointermove', {
            pointerId: 1, clientX: center.x + 250 * Math.sin(frame / 25),
            clientY: center.y + 120 * Math.cos(frame / 25), bubbles: true
          }));
        }
      }, { center });
      await page.mouse.up();
      await settle();
      await page.evaluate(() => { __parallel.phase = 'prepare-large'; });
      await jump('prepare-large', { x: 10000, y: 12000 });
      await page.getByRole('spinbutton', { name: 'Zoom percentage' }).fill('50');
      await page.getByRole('spinbutton', { name: 'Zoom percentage' }).press('Enter');
      await page.getByRole('spinbutton', { name: 'Zoom percentage' }).blur();
      await settle();
      result.largePresentedMs = await jump('large', { x: 3840, y: 6912 });
      const raw = await page.evaluate(async () => ({ ...__parallel, hashes: await Promise.all(__parallel.hashes) }));
      await writeFile(`${out}/phase6-r${run}-w${workers}-raw.json`, JSON.stringify(raw));
      const percentile = (values, p) => values.sort((a, b) => a - b)[Math.ceil(values.length * p) - 1] ?? null;
      const max = (name) => Math.max(0, ...raw.samples.filter((sample) => sample.name === name).map((sample) => sample.value));
      for (const phase of ['nine', 'large']) {
        const requests = raw.requests.filter((event) => event.phase === phase && event.window.kind === 'regions');
        const replies = raw.replies.filter((event) => event.phase === phase);
        result[phase] = { ms: Math.max(...replies.map((event) => event.time)) - Math.min(...requests.map((event) => event.time)),
          tiles: replies.flatMap((event) => event.images).length,
          populated: replies.flatMap((event) => event.images).filter((image) => image.populated).length,
          workers: new Set(replies.map((event) => event.worker)).size,
          fullCanvas: replies.some((event) => event.images.some((image) => image.strategy === 'fullCanvas')) };
      }
      result.frameP95Ms = percentile(raw.frames.filter((frame) => frame.phase === 'gesture').map((frame) => frame.ms), 0.95);
      result.frameP99Ms = percentile(raw.frames.filter((frame) => frame.phase === 'gesture').map((frame) => frame.ms), 0.99);
      result.inputP95Ms = percentile(raw.samples.filter((sample) => sample.phase === 'gesture' && sample.name === 'frame.inputToNextFrame').map((sample) => sample.ms), 0.95);
      result.accountedBytes = max('workers.accounted.bytes');
      result.workerActualBytes = max('workers.actual.bytes');
      result.budgetBytes = max('workers.budget.bytes');
      result.cpuBytes = max('tiles.cpu.bytes');
      result.gpuBytes = max('gpu.explicit.bytes');
      result.hashes = raw.hashes;
      result.failures = raw.failures;
      result.disabled = raw.samples.filter((sample) => sample.name.startsWith('workers.disabled.'));
    } catch (error) {
      result.error = String(error);
    } finally {
      result.loadAfter = loadavg();
      await browser.close();
      results.push(result);
      await writeFile(`${out}/phase6.json`, JSON.stringify(results, null, 2));
      console.log(JSON.stringify({ ...result, hashes: result.hashes?.length }));
    }
  }
}
const comparisons = [];
for (let run = 1; run <= Number(process.env.PSD_BENCH_RUNS ?? 3); run++) {
  const one = results.find((result) => result.run === run && result.workers === 1);
  const two = results.find((result) => result.run === run && result.workers === 2);
  for (const phase of ['nine', 'large']) {
    const hashes = (result) => JSON.stringify(result.hashes?.filter((hash) => hash.phase === phase).sort((a, b) => JSON.stringify(a.rectangle).localeCompare(JSON.stringify(b.rectangle))));
    const comparison = {
      run, phase, speedup: one[phase]?.ms / two[phase]?.ms,
      exactPixels: !!one.hashes?.length && !!two.hashes?.length && hashes(one) === hashes(two),
      usedTwoWorkers: two[phase]?.workers === 2,
      inputP95NoWorse: two.inputP95Ms <= one.inputP95Ms,
      withinBudget: two.accountedBytes <= two.budgetBytes,
      nineWithin150Ms: two.nine?.tiles === 9 && two.nine?.populated === 9 && two.nine?.ms <= 150
    };
    comparisons.push(comparison);
    console.log(JSON.stringify(comparison));
  }
}

await writeFile(`${out}/phase6-comparison.json`, JSON.stringify(comparisons, null, 2));
