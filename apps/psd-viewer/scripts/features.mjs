// Adapted from the PSD viewer audit's features.mjs; clean browser contexts never use a personal profile.
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../package.json', import.meta.url));
const { chromium } = require('@playwright/test');
const out = process.env.PSD_BENCH_OUT;
if (!out) {
  throw new Error('Run through benchmark.mjs');
}
const root = new URL('../../../', import.meta.url).pathname.replace(/\/$/, '');
const fixtures = `${process.env.PSD_TEXT_MIXER_RESEARCH_ROOT}/fixtures/psd`;
const b = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  channel: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? undefined : 'chrome',
  headless: true,
  args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan,WebGPU']
});
const result = { errors: [], steps: [], cacheProbe: [] };
try {
  const c = await b.newContext({ viewport: { width: 1440, height: 1000 } });
  const p = await c.newPage();
  p.on('pageerror', (e) => result.errors.push({ message: e.message, stack: e.stack }));
  await p.addInitScript(() => {
    window.__workers = [];
    window.__requests = [];
    window.__replies = [];
    const W = Worker;
    window.Worker = class extends W {
      constructor(...a) {
        super(...a);
        __workers.push(this);
        this.addEventListener('message', (e) => {
          const d = e.data;
          __replies.push({
            type: d.type,
            id: d.id,
            info: d.info,
            detail: d.detail,
            error: d.error,
            render: d.render && { milliseconds: d.render.milliseconds, approximations: d.render.approximations }
          });
        });
      }
      postMessage(d, ...a) {
        if (d.type !== 'open') {
          __requests.push(d);
        }
        super.postMessage(d, ...a);
      }
    };
  });
  await p.goto(`${process.env.PSD_BENCH_URL}/?telemetry=1`, { waitUntil: 'networkidle' });
  async function settle() {
    await p.waitForFunction(
      () => document.querySelector('[data-busy]')?.dataset.busy === 'false' && !!document.querySelector('canvas'),
      {},
      { timeout: 60000 }
    );
  }
  async function record(name) {
    await p.screenshot({ path: `${out}/assets/${name}.png` });
    result.steps.push({
      name,
      text: await p.locator('body').innerText(),
      snapshot: await p.locator('main').ariaSnapshot()
    });
  }
  await p
    .locator('input[accept=".psd,.psb"]')
    .setInputFiles(`${root}/apps/psd-viewer/src/features/examples/assets/layer-comps.psd`);
  await settle();
  await record('02-saved-state');
  const rowsBefore = await p.locator('[role=tree]').innerText();
  const id = await p.locator('[data-busy]').getAttribute('data-render-id');
  await p.getByRole('region', { name: 'Saved states' }).getByRole('combobox').selectOption({ index: 2 });
  await p.waitForFunction((old) => document.querySelector('[data-busy]').dataset.renderId !== old, id);
  await settle();
  await record('03-selected-comp');
  result.comp = { rowsBefore, rowsAfter: await p.locator('[role=tree]').innerText() };
  await p.getByRole('button', { name: 'Difference', exact: true }).click();
  await p.getByRole('region', { name: 'Difference statistics' }).waitFor();
  await record('04-comp-difference');
  await p.getByRole('button', { name: 'Our render', exact: true }).click();
  await p
    .locator('input[accept=".psd,.psb"]')
    .setInputFiles(`${root}/apps/psd-viewer/src/features/examples/assets/type-with-layer-styles.psd`);
  await settle();
  await p.locator('[data-layer-index="1"]').click();
  await p.locator('[data-layer-detail="1"]').waitFor();
  await record('05-text-inspector');
  await p
    .locator('input[accept=".psd,.psb"]')
    .setInputFiles(`${root}/apps/psd-viewer/src/features/examples/assets/rotated-smart-object.psd`);
  await settle();
  const smartRow = p
    .locator('[data-layer-index]')
    .filter({ has: p.locator('[data-kind="smartObject"]') })
    .first();
  await smartRow.click();
  await p.locator('[data-layer-detail]').waitFor();
  await record('06-smart-inspector');
  await p
    .getByRole('region', { name: 'Render settings' })
    .getByRole('combobox')
    .selectOption({ label: 'Re-render: Bicubic' });
  await settle();
  await record('07-smart-rerender');
  for (const [name, path] of [
    ['08-rgb32', 'depth/rgb32-hdr-opacity-dissolve/document.psd'],
    ['09-lab16', 'cmyk-lab-2/lab16-hue-holdout0/document.psd'],
    ['10-cmyk16', 'cmyk-lab-2/cmyk16-hue-holdout0/document.psd']
  ]) {
    await p
      .getByRole('region', { name: 'Render settings' })
      .getByRole('combobox')
      .selectOption({ label: 'Cached rasters' });
    await p.locator('input[accept=".psd,.psb"]').setInputFiles(`${fixtures}/${path}`);
    await settle();
    await record(name);
    await p.getByRole('button', { name: 'Difference', exact: true }).click();
    await p.getByRole('region', { name: 'Difference statistics' }).waitFor();
    await record(name + '-difference');
    await p.getByRole('button', { name: 'Our render', exact: true }).click();
  }
  // Verify the prepared-render key mismatch using equivalent raw protocol requests, without modifying sources.
  await p
    .locator('input[accept=".psd,.psb"]')
    .setInputFiles(`${fixtures}/oracle-1/Fade_Out_3D_Text_Effect__Down-8f977f00cfbd-g0/source-input/document.psd`);
  await settle();
  result.cacheProbe = await p.evaluate(async () => {
    const base = __requests.filter((x) => x.type === 'render').at(-1),
      w = __workers.at(-1);
    async function send(d) {
      return await new Promise((resolve) => {
        const t = performance.now();
        function listen(e) {
          if (e.data.id === d.id) {
            w.removeEventListener('message', listen);
            resolve({
              type: e.data.type,
              ms: performance.now() - t,
              renderMs: e.data.render?.milliseconds,
              error: e.data.error
            });
          }
        }
        w.addEventListener('message', listen);
        w.postMessage(d);
      });
    }
    const noState = { ...base.settings };
    delete noState.state;
    return [
      await send({ ...base, type: 'detectBlending', id: 910001, settings: noState }),
      await send({ ...base, type: 'render', id: 910002 }),
      await send({ ...base, type: 'detectBlending', id: 910003 }),
      await send({ ...base, type: 'render', id: 910004 })
    ];
  });
  result.finalReplies = await p.evaluate(() => __replies);
  await p
    .locator('input[accept=".psd,.psb"]')
    .setInputFiles(`${fixtures}/oracle-1/DVE__Enzymes__test__--1-e9610aa019d6-g0/source-input/document.psb`);
  await settle();
  result.contentTiles = await p.evaluate(async () => {
    const w = __workers.at(-1),
      base = __requests.filter((x) => x.type === 'renderWindow').at(-1),
      results = [];
    for (let n = 0; n < 8; n++) {
      const content = n % 2 === 0;
      const rectangle = content
        ? { left: 4608, top: 7680, width: 512, height: 512 }
        : { left: 15360, top: 22528, width: 512, height: 512 };
      const id = 920000 + n;
      results.push(
        await new Promise((resolve) => {
          const t = performance.now();
          function listen(e) {
            if (e.data.id === id) {
              w.removeEventListener('message', listen);
              const d = e.data;
              let nontransparent = 0;
              for (let i = 3; i < (d.images?.[0].pixels.length ?? 0); i += 4) {
                nontransparent += d.images[0].pixels[i] > 0;
              }
              resolve({
                content,
                rectangle,
                ms: performance.now() - t,
                workerMs: d.milliseconds,
                error: d.error,
                nontransparent
              });
            }
          }
          w.addEventListener('message', listen);
          w.postMessage({ ...base, id, window: { kind: 'regions', rectangles: [rectangle] } });
        })
      );
    }
    return results;
  });
} catch (e) {
  result.error = String(e);
} finally {
  await b.close();
  fs.writeFileSync(
    `${out}/features.json`,
    JSON.stringify(result, (_, v) => (typeof v === 'bigint' ? String(v) : v), 2)
  );
  console.log(
    JSON.stringify({
      error: result.error,
      steps: result.steps.map((x) => x.name),
      errors: result.errors,
      cacheProbe: result.cacheProbe
    })
  );
}
