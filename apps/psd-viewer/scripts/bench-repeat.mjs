// Adapted from the PSD viewer audit's bench-repeat.mjs; clean browser contexts never use a personal profile.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { loadavg } from 'node:os';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../package.json', import.meta.url));
const { chromium } = require('@playwright/test');
const out = process.env.PSD_BENCH_OUT;
if (!out) {
  throw new Error('Run through benchmark.mjs');
}
const base = `${process.env.PSD_TEXT_MIXER_RESEARCH_ROOT}/fixtures/psd/oracle-1`;
const cases = [
  ['large-psb', 'DVE__Enzymes__test__--1-e9610aa019d6-g0', 'psb'],
  ['many-layer', 'dribbble_psd__80488-e0f416fe634b-g0', 'psd'],
  ['text-heavy-admitted', 'src__v1.1__v1.1_-_CS6__Source__Velositey.assets__Templates__footer-3ba97617090f-g0', 'psd'],
  ['smart-object', 'Fade_Out_3D_Text_Effect__Down-8f977f00cfbd-g0', 'psd'],
  ['large-rgb16-admitted', 'DSC_6218_2021-08-10-ca9f9e594715-g0', 'psd'],
  ['resource-refusal', 'DSC_2530-1_2021-11-21-e28014496f83-g0', 'psd'],
  [
    'text-refusal',
    'Nintendo_Super_Famicom__Nintendo_Super_Famicom_Cartridge_Label_Template__Rear_-5313ea6a2cd8-g0',
    'psd'
  ]
];
const fixtures = Array.from({ length: Number(process.env.PSD_BENCH_RUNS ?? 3) }, (_, i) => i + 1).flatMap((rep) =>
  cases
    .filter((c) => !process.env.PSD_BENCH_CASES || process.env.PSD_BENCH_CASES.split(',').includes(c[0]))
    .map(([name, ...rest]) => [`${name}-r${rep}`, ...rest])
);
const init = () => {
  const a = (window.__audit = {
    events: [],
    uploads: [],
    presentations: [],
    longTasks: [],
    frames: [],
    performance: [],
    phase: 'idle',
    workers: [],
    requests: [],
    opened: null
  });
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (!entry.name.startsWith('psd:')) {
        continue;
      }

      a.performance.push({
        name: entry.name,
        start: entry.startTime,
        duration: entry.duration,
        value: entry.detail,
        phase: a.phase
      });
      if (entry.name === 'psd:upload') {
        const upload = {
          t: entry.startTime,
          end: entry.startTime + entry.duration,
          ms: entry.duration,
          bytes: entry.detail,
          phase: a.phase
        };
        a.uploads.push(upload);
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            upload.presented = performance.now();
          })
        );
      }
      if (entry.name === 'psd:frame.pixels') {
        const frame = { t: entry.startTime, end: entry.startTime + entry.duration, phase: a.phase };
        a.presentations.push(frame);
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            frame.presented = performance.now();
          })
        );
      }
    }
  }).observe({ type: 'measure', buffered: true });
  new PerformanceObserver((l) =>
    a.longTasks.push(...l.getEntries().map((x) => ({ start: x.startTime, duration: x.duration, phase: a.phase })))
  ).observe({ type: 'longtask', buffered: true });
  let last;
  const frame = (t) => {
    if (last) {
      a.frames.push({ t, dt: t - last, phase: a.phase });
    }
    last = t;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  a.putImageDataCalls = 0;
  const put = CanvasRenderingContext2D.prototype.putImageData;
  CanvasRenderingContext2D.prototype.putImageData = function (...args) {
    a.putImageDataCalls++;
    return put.apply(this, args);
  };
  document.addEventListener(
    'change',
    (e) => {
      if (e.target.matches('[role=tree] input')) {
        a.toggleInput = performance.now();
      }
    },
    true
  );
  const NativeWorker = Worker;
  window.Worker = class extends NativeWorker {
    constructor(...args) {
      super(...args);
      a.workers.push(this);
      this.addEventListener('message', (e) => {
        const d = e.data;
        const summary = { t: performance.now(), direction: 'reply', id: d.id, type: d.type, phase: a.phase };
        if (d.type === 'opened') {
          a.opened = { info: d.info, layers: d.layers, states: d.states, opening: d.opening, document: d.document };
          summary.info = d.info;
        }
        if (d.performance) {
          summary.performance = d.performance;
        }
        if (d.error) {
          summary.error = d.error;
        }
        if (d.render) {
          summary.render = {
            milliseconds: d.render.milliseconds,
            w: d.render.width,
            h: d.render.height,
            approximations: d.render.approximations
          };
        }
        if (d.images) {
          summary.images = d.images.map((i) => ({
            left: i.left,
            top: i.top,
            w: i.width,
            h: i.height,
            step: i.step,
            source: i.source,
            strategy: i.strategy,
            exact: i.exactToLayerRender,
            bytes: i.pixels.byteLength,
            approximations: i.approximations
          }));
        }
        if (d.milliseconds !== undefined) {
          summary.milliseconds = d.milliseconds;
        }
        if (d.__auditWasmBytes) {
          summary.wasmBytes = d.__auditWasmBytes;
        }
        a.events.push(summary);
      });
    }
    postMessage(d, ...rest) {
      const s = {
        t: performance.now(),
        direction: 'request',
        id: d.id,
        type: d.type,
        phase: a.phase,
        window: d.window,
        settings: d.settings,
        visibility: d.visibility,
        document: d.document,
        bytes: d.bytes?.byteLength
      };
      a.events.push(s);
      a.requests.push(d.type === 'open' ? { ...d, bytes: undefined } : d);
      return super.postMessage(d, ...rest);
    }
  };
};
function rss(rootPid) {
  try {
    const rows = execFileSync('ps', ['-axo', 'pid=,ppid=,rss=,command='], { encoding: 'utf8' })
      .trim()
      .split('\n')
      .map((l) => {
        const m = l.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/);
        return m && { pid: +m[1], ppid: +m[2], rss: +m[3] * 1024, command: m[4] };
      })
      .filter(Boolean);
    const roots = rows.filter((x) => x.pid === rootPid);
    const ids = new Set(roots.map((x) => x.pid));
    for (let n = 0; n < 5; n++) {
      for (const r of rows) {
        if (ids.has(r.ppid)) {
          ids.add(r.pid);
        }
      }
    }
    return {
      totalBytes: rows.filter((x) => ids.has(x.pid)).reduce((s, x) => s + x.rss, 0),
      processes: rows
        .filter((x) => ids.has(x.pid))
        .map((x) => ({ pid: x.pid, rss: x.rss, browserRoot: x.command.includes('--remote-debugging-pipe'), type: x.command.match(/--type=([^ ]+)/)?.[1] ?? 'browser' }))
    };
  } catch (e) {
    return { error: String(e) };
  }
}
for (const [name, dir, ext] of fixtures) {
  if (process.env.PSD_BENCH_RESUME === '1' && fs.existsSync(`${out}/${name}.json`)) {
    const previous = JSON.parse(fs.readFileSync(`${out}/${name}.json`, 'utf8'));
    if (!previous.error && !previous.openTimeout && !previous.caseTimeout) {
      continue;
    }
  }
  const file = `${base}/${dir}/source-input/document.${ext}`;
  if (!fs.existsSync(file)) {
    console.log('missing', file);
    continue;
  }
  let browser, pid;
  const result = { loadBefore: loadavg(), name, file, fileBytes: fs.statSync(file).size, started: new Date().toISOString(), rssSamples: [] };
  let expire;
  const deadline = new Promise((_, reject) => {
    expire = () => reject(new Error('Fixture exceeded 120 seconds'));
  });
  // A browser blocked in macOS startup must become a failed result, not stall the fixture matrix indefinitely.
  const watchdog = setTimeout(() => {
    result.caseTimeout = true;
    expire();
    for (const child of rss(process.pid).processes ?? []) {
      if (child.browserRoot) {
        try {
          process.kill(child.pid, 'SIGKILL');
        } catch {
          // The isolated browser may already have exited.
        }
      }
    }
  }, 120000);
  try {
    await Promise.race([
      (async () => {
        // Local launch also avoids uploading large fixture files over a remote Playwright WebSocket connection.
        browser = await chromium.launch({
          timeout: 30000,
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
          channel: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? undefined : 'chrome',
          headless: true,
          args: [
            '--enable-unsafe-webgpu',
            '--enable-features=Vulkan,WebGPU',
            '--disable-background-timer-throttling',
            '--disable-renderer-backgrounding'
          ]
        });
        if (result.caseTimeout) {
          await browser.close();
          return;
        }
        pid = rss(process.pid).processes?.find((child) => child.browserRoot)?.pid;
        if (!pid) {
          throw new Error('Could not identify the isolated Chrome process for RSS measurement.');
        }
        const context = await browser.newContext({
          viewport: { width: 1440, height: 1000 },
          deviceScaleFactor: Number(process.env.PSD_BENCH_DPR ?? 1)
        });
        await context.addInitScript(init);
        const page = await context.newPage();
        result.errors = [];
        page.on('pageerror', (e) => result.errors.push(e.message));
        await page.goto(`${process.env.PSD_BENCH_URL}/?workers=${process.env.PSD_BENCH_WORKERS ?? 1}&telemetry=1&backend=${process.env.PSD_BENCH_BACKEND ?? 'webgpu'}`, {
          waitUntil: 'networkidle'
        });
        if (name.startsWith('large-psb')) {
          await page.screenshot({ path: `${out}/assets/01-empty.png` });
        }
        result.environment = await page.evaluate(async () => {
          const adapter = await navigator.gpu?.requestAdapter();
          return {
            ua: navigator.userAgent,
            dpr: devicePixelRatio,
            hardwareConcurrency: navigator.hardwareConcurrency,
            webgpu: !!adapter,
            backend: document.querySelector('[data-backend]')?.getAttribute('data-backend'),
            adapter: adapter?.info && {
              vendor: adapter.info.vendor,
              architecture: adapter.info.architecture,
              device: adapter.info.device,
              description: adapter.info.description
            },
            heap: performance.memory && {
              used: performance.memory.usedJSHeapSize,
              total: performance.memory.totalJSHeapSize,
              limit: performance.memory.jsHeapSizeLimit
            }
          };
        });
        result.rssSamples.push({ phase: 'before-open', ...rss(pid) });
        const sample = setInterval(() => result.rssSamples.push({ phase: 'during', ...rss(pid) }), 2000);
        try {
          await page.evaluate(() => {
            __audit.phase = 'open';
            __audit.start = performance.now();
          });
          await page.locator('input[accept=".psd,.psb"]').setInputFiles(file, { timeout: 30000 });
          try {
            await page.waitForFunction(
              () => {
                const a = __audit;
                const stage = document.querySelector('[data-busy]');
                return (
                  (a.opened && a.uploads.length && stage?.dataset.busy === 'false') ||
                  document.querySelector('[data-failure]')
                );
              },
              {},
              { timeout: 120000 }
            );
          } catch (e) {
            result.openTimeout = String(e);
          }
          result.afterOpen = await page.evaluate(() => ({
            now: performance.now(),
            start: __audit.start,
            uploads: __audit.uploads,
            status: document.querySelector('footer')?.innerText,
            stage: document.querySelector('[data-busy]')?.dataset,
            backend: document.querySelector('[data-backend]')?.getAttribute('data-backend'),
            text: document.body.innerText.slice(-7000),
            heap: performance.memory && {
              used: performance.memory.usedJSHeapSize,
              total: performance.memory.totalJSHeapSize
            }
          }));
          await page.screenshot({ path: `${out}/assets/${name}-opened.png` });
          if ((await page.locator('canvas').count()) && process.env.PSD_BENCH_OPEN_ONLY !== '1') {
            await page.evaluate(() => (__audit.phase = 'actual-size'));
            await page.getByRole('button', { name: '100%', exact: true }).click();
            try {
              await page.waitForFunction(
                () => document.querySelector('[data-busy]')?.dataset.busy === 'false',
                {},
                { timeout: 60000 }
              );
            } catch (e) {
              result.actualSizeTimeout = String(e);
            }
            await page.screenshot({ path: `${out}/assets/${name}-100.png` });
            const stage = page.locator('[data-busy]');
            const b = await stage.boundingBox();
            const cx = b.x + b.width / 2,
              cy = b.y + b.height / 2;
            await page.evaluate(() => (__audit.phase = 'pan'));
            await page.mouse.move(cx, cy);
            await page.mouse.down();
            await page.evaluate(
              async ({ cx, cy }) => {
                const a = __audit,
                  stage = document.querySelector('[data-busy]');
                a.handlers = [];
                for (let i = 1; i <= 120; i++) {
                  await new Promise(requestAnimationFrame);
                  const t = performance.now();
                  stage.dispatchEvent(
                    new PointerEvent('pointermove', {
                      pointerId: 1,
                      clientX: cx + 150 * Math.sin(i / 20),
                      clientY: cy + 80 * Math.cos(i / 20),
                      bubbles: true
                    })
                  );
                  a.handlers.push({ phase: 'pan', ms: performance.now() - t });
                }
              },
              { cx, cy }
            );
            await page.mouse.up();
            await page.evaluate(() => (__audit.phase = 'pan-settle'));
            try {
              await page.waitForFunction(
                () => document.querySelector('[data-busy]')?.dataset.busy === 'false',
                {},
                { timeout: 60000 }
              );
            } catch (e) {
              result.panTimeout = String(e);
            }
            await page.evaluate(() => (__audit.phase = 'zoom'));
            await page.evaluate(
              async ({ cx, cy }) => {
                const stage = document.querySelector('[data-busy]');
                for (let i = 0; i < 120; i++) {
                  await new Promise(requestAnimationFrame);
                  const t = performance.now();
                  stage.dispatchEvent(
                    new WheelEvent('wheel', {
                      deltaY: i < 60 ? 4 : -4,
                      clientX: cx,
                      clientY: cy,
                      bubbles: true,
                      cancelable: true
                    })
                  );
                  __audit.handlers.push({ phase: 'zoom', ms: performance.now() - t });
                }
              },
              { cx, cy }
            );
            await page.evaluate(() => (__audit.phase = 'zoom-settle'));
            try {
              await page.waitForFunction(
                () => document.querySelector('[data-busy]')?.dataset.busy === 'false',
                {},
                { timeout: 60000 }
              );
            } catch (e) {
              result.zoomTimeout = String(e);
            }
            const checkbox = page.locator('[role="tree"] input[type="checkbox"]').first();
            if (await checkbox.count()) {
              await page.evaluate(() => {
                __audit.phase = 'toggle';
                __audit.toggleStart = performance.now();
                __audit.toggleUploads = __audit.uploads.length;
              });
              await checkbox.click({ timeout: 10000 });
              try {
                await page.waitForFunction(
                  () =>
                    __audit.uploads.length > __audit.toggleUploads &&
                    document.querySelector('[data-busy]')?.dataset.busy === 'false',
                  {},
                  { timeout: 60000 }
                );
              } catch (e) {
                result.toggleTimeout = String(e);
              }
              result.toggle = await page.evaluate(() => ({
                start: __audit.toggleStart,
                input: __audit.toggleInput,
                end: performance.now(),
                upload: __audit.uploads[__audit.toggleUploads]
              }));
            }
            // Issue four single-tile requests after UI tests, retaining exactly the app's settings.
            await page.evaluate(() => (__audit.phase = 'tile-probe'));
            result.probes = await page.evaluate(async () => {
              const a = __audit;
              const req = [...a.requests].reverse().find((x) => x.type === 'renderWindow' || x.type === 'render');
              if (!req || !a.opened) {
                return [];
              }
              const info = a.opened.info;
              const results = [];
              for (let n = 0; n < 4; n++) {
                const id = 900000 + n;
                const left = Math.max(0, Math.min(info.width - 512, Math.floor(info.width / 2) + (n % 2) * 512));
                const top = Math.max(0, Math.min(info.height - 512, Math.floor(info.height / 2) + Math.floor(n / 2) * 512));
                results.push(
                  await new Promise((resolve) => {
                    const w = a.workers[0];
                    const t = performance.now();
                    const timer = setTimeout(() => {
                      w.removeEventListener('message', listen);
                      resolve({ timeout: true });
                    }, 20000);
                    function listen(e) {
                      if (e.data.id === id) {
                        clearTimeout(timer);
                        w.removeEventListener('message', listen);
                        const d = e.data;
                        resolve({
                          latency: performance.now() - t,
                          workerMs: d.milliseconds,
                          error: d.error,
                          images: d.images?.map((i) => ({
                            w: i.width,
                            h: i.height,
                            strategy: i.strategy,
                            bytes: i.pixels.byteLength,
                            exact: i.exactToLayerRender
                          }))
                        });
                      }
                    }
                    w.addEventListener('message', listen);
                    w.postMessage({
                      ...req,
                      type: 'renderWindow',
                      id,
                      window: {
                        kind: 'regions',
                        rectangles: [{ left, top, width: Math.min(512, info.width), height: Math.min(512, info.height) }]
                      }
                    });
                  })
                );
              }
              return results;
            });
          }
          result.data = await page.evaluate(() => {
            const { workers, requests, ...data } = __audit;
            return data;
          });
          const cdp = await context.newCDPSession(page);
          result.cdpHeap = await cdp.send('Runtime.getHeapUsage');
          result.performance = await cdp.send('Performance.getMetrics');
          result.rssSamples.push({ phase: 'after', ...rss(pid) });
        } finally {
          clearInterval(sample);
        }
      })(),
      deadline
    ]);
  } catch (e) {
    result.error = String(e);
  } finally {
    try {
      let closing;
      try {
        await Promise.race([browser?.close(), new Promise((resolve) => { closing = setTimeout(resolve, 5000); })]);
      } finally {
        clearTimeout(closing);
      }
    } finally {
      clearTimeout(watchdog);
    }
  }
  result.loadAfter = loadavg();
  fs.writeFileSync(
    `${out}/${name}.json`,
    JSON.stringify(result, (_, v) => (typeof v === 'bigint' ? String(v) : v), 2)
  );
  console.log(
    JSON.stringify(
      {
        name,
        error: result.error,
        timeout: result.openTimeout,
        status: result.afterOpen?.status,
        uploads: result.afterOpen?.uploads?.length,
        probes: result.probes
      },
      (_, v) => (typeof v === 'bigint' ? String(v) : v)
    )
  );
}
