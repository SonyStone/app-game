import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer as createNetServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { createServer } from 'vite';

/**
 * Chrome/WebGPU regression for every LEGO kind and look, box, chooser and carried-kit interactions.
 * Starts Vite on free ports and uses isolated browser storage.
 * PAINT_MASTER_URL optionally compares a separately served baseline.
 * PAINT_SCREENSHOTS defaults to paint-lego-browser in the system temp directory.
 */
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = process.env.PAINT_SCREENSHOTS ?? path.join(os.tmpdir(), 'paint-lego-browser');
const servers = [];
const caches = [];
let browser;
let page;

try {
  await mkdir(output, { recursive: true });
  const url = process.env.PAINT_URL ?? (await startServer(root));
  browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--enable-unsafe-webgpu', '--use-angle=metal']
  });

  const context = await browser.newContext({ viewport: { width: 1920, height: 1200 }, deviceScaleFactor: 2 });
  page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('requestfailed', (request) => console.error('Request failed:', request.url(), request.failure()));
  page.on('response', (response) => {
    if (response.status() >= 400) {
      console.error('HTTP', response.status(), response.url());
    }
  });

  await openStudio(page, url);
  errors.length = 0;

  // Registry metadata automatically brings newly registered kinds and looks into this layout check.
  const parts = await page.evaluate(async () => {
    const { partDefinitions } = await import('/src/variants/lego/parts.tsx');
    const { builtInPresets } = await import('/src/features/brush-library/index.ts');
    let column = 0;
    let row = 0;
    let rowHeight = 0;
    const parts = partDefinitions.flatMap((definition) =>
      (definition.looks?.looks ?? [undefined]).map((look) => {
        const span =
          definition.family === 'action'
            ? (look?.min ?? { columns: 1, rows: 1 })
            : definition.family === 'value'
              ? { columns: look?.id === 'knob' ? 1 : 3, rows: 1 }
              : { columns: Math.max(2, look?.min.columns ?? 2), rows: Math.max(2, look?.min.rows ?? 2) };
        if (column + span.columns > 36) {
          column = 0;
          row += rowHeight + 1;
          rowHeight = 0;
        }
        const part = {
          id: `check-${definition.kind}-${look?.id ?? 'default'}`,
          kind: definition.family === 'preset' ? `preset:${builtInPresets[0].id}` : definition.kind,
          cell: { column, row },
          span,
          ...(look ? { looks: { [`${span.columns}x${span.rows}`]: look.id } } : {})
        };
        column += span.columns + 1;
        rowHeight = Math.max(rowHeight, span.rows);
        return part;
      })
    );
    const preset = parts.find((part) => part.kind.startsWith('preset:'));
    parts.push({
      ...preset,
      id: 'check-preset-1x3',
      cell: { column: 0, row: row + rowHeight + 1 },
      span: { columns: 1, rows: 3 }
    });
    return parts;
  });

  await seed(page, parts);
  await checkLayout(page, parts, 'fixed');
  await page.screenshot({ path: path.join(output, 'foundation-fixed.png') });
  console.log(`PASS ${parts.length} kind/look layouts and centred action icons`);

  const broken = await page.addStyleTag({ content: '[data-part-kind] { display: block !important; }' });
  await assert.rejects(() => checkLayout(page, parts, 'broken'), /collapsed|fill|centred/);
  await broken.evaluate((element) => element.remove());
  await checkLayout(page, parts, 'fixed');
  console.log('PASS layout check rejects the original collapsed-frame regression');

  if (process.env.PAINT_MASTER_URL) {
    const masterUrl = process.env.PAINT_MASTER_URL;
    const master = await context.newPage();
    await openStudio(master, masterUrl);
    await seed(master, parts, false);
    await checkLayout(master, parts, 'master');
    await master.screenshot({ path: path.join(output, 'master.png') });
    await master.close();
    console.log('PASS identical seeded board on master; screenshot saved');
  }

  const presets = parts.filter((part) => part.kind.startsWith('preset:'));
  await page.locator(`[data-part="${presets[0].id}"] button`).click();
  for (const preset of presets) {
    await checkPresetRing(page, preset);
    await page.locator(`[data-part="${preset.id}"]`).screenshot({
      path: path.join(output, `active-preset-${preset.span.columns}x${preset.span.rows}.png`)
    });
  }

  const hiddenRing = await page.addStyleTag({ content: '[data-active]::after { display: none !important; }' });
  await assert.rejects(() => checkPresetRing(page, presets[0]), /ring/);
  await hiddenRing.evaluate((element) => element.remove());
  console.log('PASS active preset rings at 2×2 and 1×3; check rejects a hidden ring');

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const wheel = parts.find((part) => part.kind === 'color:wheel' && part.looks?.['2x2'] === 'square');
  await page.locator(`[data-part="${wheel.id}"]`).click();
  await page.getByRole('button', { name: 'Look', exact: true }).click();
  await page.getByRole('heading', { name: 'Look at 2×2' }).waitFor();
  const choices = page.locator('[data-part-kind="Looks"] [data-mode="preview"]');
  await choices.first().locator(':scope > *').waitFor();
  assert.equal(await choices.count(), 5);
  await page.screenshot({ path: path.join(output, 'look-chooser.png') });
  await page
    .locator('[data-part-kind="Looks"] button')
    .filter({ hasText: /^Disc$/ })
    .click();
  await page.keyboard.press('Escape');
  console.log('PASS chooser renders five previews and applies a look');

  const box = page.getByRole('complementary', { name: 'Box of parts' });
  await checkSheetDrag(page, box);
  await box.locator('[class*="trayBar"]').click();
  const kit = page.locator('[title^="Kit:"]').first();
  await kit.waitFor();
  await page.screenshot({ path: path.join(output, 'box-open.png') });

  const rect = await kit.boundingBox();
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(1200, 500, { steps: 12 });
  const ghost = page.locator('[class*="ghostBlock"]');
  await ghost.waitFor();
  assert.ok((await ghost.locator('[data-mode="preview"] > *').count()) > 0, 'carried kit renders immediately');
  await page.screenshot({ path: path.join(output, 'kit-ghost.png') });

  await page.mouse.up();
  await ghost.waitFor({ state: 'detached' });
  await page.waitForFunction(() =>
    document.querySelector('aside[aria-label="Box of parts"]')?.hasAttribute('data-closed')
  );

  // A kit drop closes the box; verify the handle can open and close it again too.
  await box.locator('[class*="trayBar"]').click();
  await kit.waitFor();
  await box.locator('[class*="trayBar"]').click();
  await page.waitForFunction(() =>
    document.querySelector('aside[aria-label="Box of parts"]')?.hasAttribute('data-closed')
  );

  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await box.waitFor({ state: 'detached' });
  assert.deepEqual(errors, [], 'uncaught page errors');
  console.log('PASS box open/close and kit drag-out ghost');
  const stored = await page.evaluate(() => ({ ...localStorage }));
  page = await context.newPage();
  const showcaseWorkers = [];
  page.on('worker', (worker) => showcaseWorkers.push(worker.url()));
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${url}/paint/lego/parts/`);
  await page.locator('[data-parts-showcase]').waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() =>
    [...document.querySelectorAll('[data-part-kind="color:wheel"] canvas')].every((canvas) => canvas.width > 0)
  );
  await checkShowcase(page);
  await checkValueText(page);
  // Keep each complete section in the viewport so screenshots include offscreen canvas layers.
  await page.locator('header').evaluate((element) => {
    element.style.position = 'static';
  });
  for (const mode of ['live', 'edit', 'preview']) {
    const section = page.getByRole('region', { name: `${mode} specimens` });
    const height = Math.ceil((await section.boundingBox()).height) + 80;
    await page.setViewportSize({ width: 1920, height });
    await section.scrollIntoViewIfNeeded();
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await section.screenshot({ path: path.join(output, `parts-${mode}.png`) });
  }
  await page.locator('header').evaluate((element) => {
    element.style.position = '';
  });
  await page.setViewportSize({ width: 1920, height: 1200 });
  // This gallery has one shared fixture and must not mutate any existing editor preferences.
  for (const columns of [1, 2, 3, 4, 10]) {
    for (const rows of [1, 2, 3, 4, 10]) {
      await page.getByLabel('Columns', { exact: true }).selectOption(String(columns));
      await page.getByLabel('Rows', { exact: true }).selectOption(String(rows));
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await checkShowcase(page);
    }
  }
  assert.deepEqual(await page.evaluate(() => ({ ...localStorage })), stored, 'showcase must not write storage');
  assert.deepEqual(errors, [], 'uncaught showcase errors');
  assert.deepEqual(showcaseWorkers, [], 'showcase must not start session or preview workers');
  console.log(
    'PASS registry showcase: minimum sizes, 25 size pairs, three modes, missing/broken tiles, displayed backing sizes'
  );
  console.log(`Screenshots: ${output}`);
} catch (error) {
  await page?.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await Promise.all(servers.map((server) => server.close()));
  await Promise.all(caches.map((cache) => rm(cache, { recursive: true, force: true })));
}

/** A cold Vite optimizer may invalidate its first dependency URLs; reload once after its discovery pass. */
async function openStudio(tab, url) {
  await tab.goto(`${url}/variants.html#lego`);
  try {
    await tab.getByRole('button', { name: 'Edit', exact: true }).waitFor({ timeout: 15000 });
  } catch {
    await tab.reload();
    await tab.getByRole('button', { name: 'Edit', exact: true }).waitFor({ timeout: 30000 });
  }
}

/** Seeds the same board in a fresh profile, waiting for fonts, layout and actual brush preview rendering. */
async function seed(tab, parts, sharedPreview = true) {
  await tab.evaluate((parts) => {
    localStorage.setItem(
      'paint.lego',
      JSON.stringify({ version: 2, board: { panels: [{ id: 'matrix', at: { x: 16, y: 16 }, parts }] } })
    );
    localStorage.setItem('paint.recentColors', JSON.stringify(['#c4463a', '#3d6a8c', '#e6b93d']));
  }, parts);
  await tab.reload();
  await tab.locator(`[data-part="${parts.at(-1).id}"]`).waitFor();
  if (sharedPreview) {
    await tab.locator('[data-part] canvas[data-preview-state="ready"]').first().waitFor({ timeout: 60000 });
  }
  await tab.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await tab.evaluate(() => document.fonts.ready);
}

/** Verifies the selected ring covers the tile above its opaque sample without intercepting presses. */
async function checkPresetRing(tab, part) {
  const tile = tab.locator(`[data-part="${part.id}"] button[data-active]`);
  await tile.waitFor();
  await tile.locator('canvas[data-preview-state="ready"]').waitFor({ timeout: 60000 });
  const ring = await tile.evaluate((element) => {
    const style = getComputedStyle(element, '::after');
    return {
      content: style.content,
      display: style.display,
      visibility: style.visibility,
      opacity: style.opacity,
      position: style.position,
      inset: style.inset,
      zIndex: style.zIndex,
      pointerEvents: style.pointerEvents,
      shadow: style.boxShadow
    };
  });
  const label = `${part.span.columns}×${part.span.rows} active preset ring`;
  assert.equal(ring.content, '""', `${label} must be generated`);
  assert.notEqual(ring.display, 'none', `${label} must be displayed`);
  assert.equal(ring.visibility, 'visible', `${label} must be visible`);
  assert.equal(ring.opacity, '1', `${label} must be opaque`);
  assert.equal(ring.position, 'absolute', `${label} must overlay the sample`);
  assert.equal(ring.inset, '0px', `${label} must cover every edge`);
  assert.ok(Number(ring.zIndex) > 0, `${label} must paint above the sample`);
  assert.equal(ring.pointerEvents, 'none', `${label} must let presses reach the tile`);
  assert.ok(ring.shadow.includes('inset') && ring.shadow.includes('0px 0px 0px 2px'), `${label} must be 2px`);
}

/** Measures real children and chips, which jsdom cannot lay out, and saves the dimensions for comparison. */
async function checkLayout(tab, parts, label) {
  const measurements = await tab.evaluate(
    (parts) =>
      parts.map((part) => {
        const content = document.querySelector(`[data-part="${part.id}"]`).firstElementChild;
        const view = content.querySelector('[data-part-kind]')?.firstElementChild ?? content.firstElementChild;

        const box = content.getBoundingClientRect();
        const child = view?.getBoundingClientRect();
        const chips = [...content.querySelectorAll('[class*="chip"], [class*="slot"]')].map(
          (chip) => chip.getBoundingClientRect().height
        );
        const icon = view?.querySelector('svg')?.getBoundingClientRect();
        return {
          id: part.id,
          kind: part.kind,
          compact: part.span.columns === 1 && part.span.rows === 1,
          width: box.width,
          height: box.height,
          childWidth: child?.width,
          childHeight: child?.height,
          chips,
          iconOffset: icon
            ? Math.hypot(
                icon.x + icon.width / 2 - box.x - box.width / 2,
                icon.y + icon.height / 2 - box.y - box.height / 2
              )
            : undefined
        };
      }),
    parts
  );
  for (const part of measurements) {
    assert.ok(
      part.childWidth >= part.width * 0.9 && part.childHeight >= part.height * 0.9,
      `${part.id} must fill its tile: ${JSON.stringify(part)}`
    );
    assert.ok(
      part.chips.every((height) => height > 4),
      `${part.id} has collapsed chips`
    );
    if (part.kind.startsWith('action:') && part.compact) {
      assert.ok(part.iconOffset < 1, `${part.id} icon must be centred: ${part.iconOffset}`);
    }
  }
  await writeFile(path.join(output, `${label}-layout.json`), JSON.stringify(measurements, null, 2));
}

/** Serves a checkout without watching or writing a Vite cache in that checkout. */
async function startServer(appRoot) {
  const cacheDir = await mkdtemp(path.join(os.tmpdir(), 'paint-lego-vite-'));
  caches.push(cacheDir);
  const socket = createNetServer();
  await new Promise((resolve) => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  const server = await createServer({
    root: appRoot,
    configFile: path.join(appRoot, 'vite.config.ts'),
    cacheDir,
    optimizeDeps: { entries: [path.join(appRoot, 'variants.html')] },
    logLevel: 'error',
    server: { host: '127.0.0.1', port, strictPort: true, hmr: false, watch: null }
  });
  servers.push(server);
  await server.listen();
  await server.environments.client.depsOptimizer?.scanProcessing;
  return server.resolvedUrls.local[0].replace(/\/$/, '');
}

/** Checks real specimen content, including transformed backing sizes; error and missing tiles stay measurable. */
async function checkShowcase(tab) {
  assert.equal(
    await tab.locator('[aria-label^="Broken part:"]').count(),
    3,
    'only the deliberately broken specimens may fail'
  );
  const specimens = await tab.locator('[data-specimen]').evaluateAll((figures) =>
    figures.map((figure) => {
      const frame = figure.querySelector('[data-part-kind]');
      const content = frame?.firstElementChild;
      const box = content?.getBoundingClientRect();
      const host = frame?.getBoundingClientRect();
      return {
        id: figure.dataset.specimen,
        width: box?.width ?? 0,
        height: box?.height ?? 0,
        hostWidth: host?.width ?? 0,
        hostHeight: host?.height ?? 0,
        canvases: [...figure.querySelectorAll('[data-part-kind="color:wheel"] canvas')].map((canvas) => ({
          backing: canvas.width,
          capped: !!canvas.parentElement.querySelector('[aria-label="Hue and saturation"]'),
          displayed: Math.round(canvas.getBoundingClientRect().width * devicePixelRatio)
        }))
      };
    })
  );
  assert.ok(specimens.length > 60, 'showcase must contain the registry catalogue in all three modes');
  for (const specimen of specimens) {
    assert.ok(specimen.width > 0 && specimen.height > 0, `zero-sized specimen: ${JSON.stringify(specimen)}`);
    assert.ok(
      specimen.width <= specimen.hostWidth + 1 && specimen.height <= specimen.hostHeight + 1,
      `specimen must fit its frame: ${JSON.stringify(specimen)}`
    );
    for (const canvas of specimen.canvases) {
      assert.ok(
        Math.abs(canvas.backing - Math.min(canvas.capped ? 600 : Infinity, canvas.displayed)) <= 1,
        `picker backing must follow displayed CSS size × DPR: ${JSON.stringify({ specimen: specimen.id, ...canvas })}`
      );
    }
  }
}

/** Real animated sheet drag must reuse every already-mounted board picker bitmap. */
async function checkSheetDrag(tab, box) {
  await tab.evaluate(
    () =>
      new Promise((resolve) => {
        let remaining = 10;
        const settle = () => (--remaining ? requestAnimationFrame(settle) : resolve());
        requestAnimationFrame(settle);
      })
  );
  const handle = await box.locator('[class*="trayBar"]').boundingBox();
  await tab.evaluate(() => {
    const canvases = [...document.querySelectorAll('[data-part] [data-part-kind="color:wheel"] canvas')];
    window.pickerDrag = { reallocations: 0, changes: [], blankFrames: 0, frames: 0, costs: [], canvases };
    for (const name of ['width', 'height']) {
      const descriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, name);
      for (const canvas of canvases) {
        Object.defineProperty(canvas, name, {
          configurable: true,
          get() {
            return descriptor.get.call(this);
          },
          set(value) {
            window.pickerDrag.reallocations++;
            window.pickerDrag.changes.push({
              name,
              old: descriptor.get.call(this),
              next: value,
              part: this.closest('[data-part]').dataset.part
            });
            descriptor.set.call(this, value);
          }
        });
      }
    }
    const raf = window.requestAnimationFrame;
    window.pickerDrag.raf = raf;
    window.requestAnimationFrame = (callback) =>
      raf.call(window, (time) => {
        const start = performance.now();
        callback(time);
        if (callback !== inspect) {
          window.pickerDrag.costs.push({ time, duration: performance.now() - start });
        }
      });
    const inspect = () => {
      const state = window.pickerDrag;
      if (!state.running) {
        return;
      }
      state.frames++;
      for (const canvas of canvases) {
        const probe = document.createElement('canvas');
        probe.width = probe.height = 8;
        const context = probe.getContext('2d');
        context.drawImage(canvas, 0, 0, 8, 8);
        if (!context.getImageData(0, 0, 8, 8).data.some((value, i) => i % 4 === 3 && value > 0)) {
          state.blankFrames++;
        }
      }
      requestAnimationFrame(inspect);
    };
    window.pickerDrag.running = true;
    requestAnimationFrame(inspect);
  });
  const cdp = await tab.context().newCDPSession(tab);
  await cdp.send('Performance.enable');
  const metrics = async () =>
    Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(({ name, value }) => [name, value]));
  const before = await metrics();
  await tab.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await tab.mouse.down();
  for (let i = 1; i <= 80; i++) {
    await tab.mouse.move(
      handle.x + handle.width / 2,
      handle.y + handle.height / 2 - 400 * Math.sin((Math.PI * i) / 80)
    );
    await tab.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  }
  await tab.mouse.up();
  const after = await metrics();
  await cdp.detach();
  const result = await tab.evaluate(() => {
    const state = window.pickerDrag;
    state.running = false;
    window.requestAnimationFrame = state.raf;
    for (const canvas of state.canvases) {
      delete canvas.width;
      delete canvas.height;
    }
    const costs = new Map();
    for (const { time, duration } of state.costs) {
      costs.set(time, (costs.get(time) ?? 0) + duration);
    }
    const times = [...costs.values()].sort((a, b) => a - b);
    return {
      reallocations: state.reallocations,
      changes: state.changes,
      blankFrames: state.blankFrames,
      frames: state.frames,
      pickers: state.canvases.length,
      rafMedianMs: times[Math.floor(times.length / 2)],
      rafMaxMs: times.at(-1),
      rafMeanMs: times.reduce((a, b) => a + b, 0) / times.length
    };
  });
  result.scriptMsPerMove = ((after.ScriptDuration - before.ScriptDuration) * 1000) / 80;
  result.taskMsPerMove = ((after.TaskDuration - before.TaskDuration) * 1000) / 80;
  assert.ok(result.pickers >= 4, 'drag must exercise mounted picker looks');
  assert.equal(result.reallocations, 0, 'sheet drag must not resize picker bitmaps');
  assert.equal(result.blankFrames, 0, 'sheet drag must never expose an empty picker bitmap');
  await writeFile(path.join(output, 'sheet-drag.json'), JSON.stringify(result, null, 2));
  console.log('PASS 80-frame sheet drag', result);
}

/** Minimum-size hex and number fields must display their complete value, including inputs with no overflow metrics. */
async function checkValueText(tab) {
  const measurements = await tab
    .locator('[data-part-kind="color:hex"] input, [data-part-kind^="value:"] input')
    .evaluateAll((inputs) =>
      inputs.map((input) => {
        const style = getComputedStyle(input);
        const context = document.createElement('canvas').getContext('2d');
        context.font = style.font;
        return {
          specimen: input.closest('[data-specimen]').dataset.specimen,
          value: input.value,
          scroll: input.scrollWidth,
          client: input.clientWidth,
          text: context.measureText(input.value).width,
          available: input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
        };
      })
    );
  assert.ok(measurements.length > 30, 'check all value looks and modes');
  for (const measurement of measurements) {
    assert.ok(
      measurement.scroll <= measurement.client && measurement.text <= measurement.available + 1,
      `clipped value: ${JSON.stringify(measurement)}`
    );
  }
  await writeFile(path.join(output, 'value-text.json'), JSON.stringify(measurements, null, 2));
}
