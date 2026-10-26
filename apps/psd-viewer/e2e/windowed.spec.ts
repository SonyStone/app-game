import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { truncate, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { largePsb } from '../../../packages/psd/test/largePsb';

const stage = (page: Page) => page.locator('[data-busy]');

/** A tiny generated file exercises the real worker/WASM path on a canvas that cannot fit in memory whole. */
for (const workers of [1, 2]) {
  test(`opens a generated 300000-square PSB through bounded regions with ${workers} workers`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      const NativeWorker = Worker;
      window.Worker = class extends NativeWorker {
        postMessage(message: { type: string }, options: Transferable[] | StructuredSerializeOptions = []) {
          if (message.type === 'detectBlending') {
            performance.mark('test:windowedDetection');
          }

          if (Array.isArray(options)) {
            super.postMessage(message, options);
          } else {
            super.postMessage(message, options);
          }
        }
      };
    });
    await page.goto(`/?workers=${workers}`);
    await page.locator('input[accept=".psd,.psb"]').setInputFiles({
      name: 'large-generated.psb',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from(largePsb())
    });
    await expect(stage(page)).toHaveAttribute('data-render-source', 'layers');
    await expect(stage(page)).toHaveAttribute('data-busy', 'false');
    await expect(page.getByRole('note')).toContainText('Windowed layer view');
    await expect(page.getByRole('button', { name: 'Photoshop', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Difference', exact: true })).toBeDisabled();
    const canvas = page.getByRole('img', { name: 'Our render', exact: true });
    const overviewSize = await canvas.evaluate((element: HTMLCanvasElement) => [element.width, element.height]);
    expect(overviewSize[0] * overviewSize[1]).toBeLessThan(2_097_152);
    await page.getByRole('button', { name: '100%', exact: true }).click();
    await expect(stage(page)).toHaveAttribute('data-render-step', '1');
    await expect(stage(page)).toHaveAttribute('data-busy', 'false');
    await panFromCanvasCenter(page, { width: 300000, height: 300000 }, { x: 299072, y: 299072 });
    await expect(stage(page)).toHaveAttribute('data-busy', 'false');
    await expect.poll(() => hasVisiblePixels(page)).toBe(true);
    const bounds = (await stage(page).boundingBox())!;
    const first = await stage(page).getAttribute('data-render-id');
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width / 2 + 180, bounds.y + bounds.height / 2 + 70, { steps: 12 });
    await page.mouse.up();
    await expect(stage(page)).not.toHaveAttribute('data-render-id', first!);
    await expect(stage(page)).toHaveAttribute('data-busy', 'false');
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await expect(page.getByRole('spinbutton', { name: 'Zoom percentage' })).toHaveValue('125');
    await expect(stage(page)).toHaveAttribute('data-busy', 'false');
    const regionSize = await canvas.evaluate((element: HTMLCanvasElement) => [element.width, element.height]);
    expect(regionSize[0] * regionSize[1]).toBeLessThanOrEqual(4_194_304);
    expect(await page.evaluate(() => performance.getEntriesByName('test:windowedDetection').length)).toBe(0);
    expect(errors).toEqual([]);
    expect(page.workers()).toHaveLength(workers);
  });
}

/** A sparse oversized source is rejected before WASM copies it; the worker remains usable. */
test('shows a budget refusal as an open failure and can open another file', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const source = test.info().outputPath('over-budget.psb');
  await writeFile(source, largePsb());
  await truncate(source, 128 * 1024 * 1024 + 1);
  await page.goto('/');
  const picker = page.locator('input[accept=".psd,.psb"]');
  await picker.setInputFiles(source);
  const failure = page.locator('[data-failure="budget"]');
  await expect(failure).toContainText("exceeds the viewer's resource budget");
  await expect(failure).toContainText('allocation bytes');
  await expect(page.locator('footer')).toContainText('Failed to open');
  await expect(failure.getByRole('button', { name: 'Retry strict reading' })).toBeVisible();
  await expect(failure).toContainText('Strict reading skips Photoshop recovery');
  await picker.setInputFiles({
    name: 'small-source.psb',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from(largePsb())
  });
  await expect(failure).toHaveCount(0);
  await expect(stage(page)).toHaveAttribute('data-render-source', 'layers');
  await expect(stage(page)).toHaveAttribute('data-busy', 'false');
  expect(errors).toEqual([]);
});

/** Opt-in measurement against the public PSB in place; no large fixture is copied into the product. */
test('measures the real large PSB open, pan, zoom and worker memory', async ({ page, browser }) => {
  test.skip(!process.env.PSD_LARGE_PSB, 'Set PSD_LARGE_PSB to an existing public PSB path for the manual scale check.');
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.locator('input[accept=".psd,.psb"]').waitFor({ state: 'attached' });
  await page.evaluate(() => {
    const timing = { start: 0, frames: [] as { time: number; source: string; busy: string }[] };
    (window as unknown as { psbTiming: typeof timing }).psbTiming = timing;
    document.querySelector('input[type=file]')!.addEventListener(
      'change',
      () => {
        timing.start = performance.now();
      },
      { capture: true }
    );
    new MutationObserver(() => {
      const stage = document.querySelector('[data-busy]')!;
      const source = stage.getAttribute('data-render-source');
      if (source) {
        timing.frames.push({ time: performance.now() - timing.start, source, busy: stage.getAttribute('data-busy')! });
      }
    }).observe(document.querySelector('[data-busy]')!, { attributes: true });
  });
  await page.locator('input[accept=".psd,.psb"]').setInputFiles(process.env.PSD_LARGE_PSB!);
  await expect(stage(page)).toHaveAttribute('data-render-source', 'layers', { timeout: 60000 });
  await expect(stage(page)).toHaveAttribute('data-busy', 'false', { timeout: 60000 });
  const opening = await page.evaluate(
    () =>
      (window as unknown as { psbTiming: { frames: { time: number; source: string; busy: string }[] } }).psbTiming
        .frames
  );
  const worker = page.workers().find((worker) => worker.url().includes('psd.worker'))!;
  const viewerUrl = '/@fs' + fileURLToPath(new URL('../../../packages/psd/src/viewer.ts', import.meta.url));
  const wasmMemory = () =>
    worker.evaluate(async (viewerUrl) => {
      const { loadPsdViewer } = await import(viewerUrl);
      const codec = await loadPsdViewer();
      return (await codec.default()).memory.buffer.byteLength as number;
    }, viewerUrl);
  const cdp = await browser.newBrowserCDPSession();
  const rendererRss = async () => {
    const { processInfo } = await cdp.send('SystemInfo.getProcessInfo');
    const ids = processInfo.filter((process) => process.type === 'renderer').map((process) => process.id);
    const values = execFileSync('ps', ['-o', 'rss=', '-p', ids.join(',')], { encoding: 'utf8' })
      .trim()
      .split(/\s+/)
      .map(Number);
    return values.reduce((sum, kib) => sum + kib * 1024, 0);
  };
  const memory = [{ phase: 'overview', wasm: await wasmMemory(), rendererRss: await rendererRss() }];
  await page.screenshot({ path: test.info().outputPath('large-psb-overview.png') });
  const timeAction = async (action: () => Promise<unknown>) => {
    const before = await stage(page).getAttribute('data-render-id');
    const start = performance.now();
    await action();
    await expect(stage(page)).not.toHaveAttribute('data-render-id', before!);
    await expect(stage(page)).toHaveAttribute('data-busy', 'false', { timeout: 60000 });
    return performance.now() - start;
  };
  const actualSizeMs = await timeAction(() => page.getByRole('button', { name: '100%', exact: true }).click());
  memory.push({ phase: '100%', wasm: await wasmMemory(), rendererRss: await rendererRss() });
  // Most of this file is transparent. Move to its real shape/text content before measuring local interaction.
  const contentPanMs = await timeAction(() =>
    panFromCanvasCenter(page, { width: 30806, height: 45624 }, { x: 5200, y: 7900 })
  );
  await expect.poll(() => hasVisiblePixels(page)).toBe(true);
  const bounds = (await stage(page).boundingBox())!;
  const panMs = await timeAction(async () => {
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width / 2 + 250, bounds.y + bounds.height / 2 + 100, { steps: 12 });
    await page.mouse.up();
  });
  const zoomMs = await timeAction(() => page.getByRole('button', { name: 'Zoom in', exact: true }).click());
  memory.push({ phase: 'pan+zoom', wasm: await wasmMemory(), rendererRss: await rendererRss() });
  await page.screenshot({ path: test.info().outputPath('large-psb-region.png') });
  const fitMs = await timeAction(() => page.getByRole('button', { name: 'Fit', exact: true }).click());
  expect(errors).toEqual([]);
  expect(await stage(page).getAttribute('data-render-source')).toBe('layers');
  const metrics = {
    viewport: await stage(page).boundingBox(),
    firstPreviewMs: opening.find((frame) => frame.source === 'savedComposite')?.time,
    freshOverviewMs: opening.find((frame) => frame.source === 'layers' && frame.busy === 'false')?.time,
    actualSizeMs,
    contentPanMs,
    panMs,
    zoomMs,
    cachedFitMs: fitMs,
    memory,
    memoryNotes:
      'WASM linear memory is a high-water allocation. RSS is sampled after settling, summed over this isolated Chrome instance renderer processes; it is not peak RSS.'
  };
  console.log(JSON.stringify(metrics, null, 2));
  await test.info().attach('large-psb-measurements', {
    body: Buffer.from(JSON.stringify(metrics, null, 2)),
    contentType: 'application/json'
  });
  await cdp.detach();
});

/** At 100%, pans from the centered canvas to a known document point using the viewport's pointer handlers. */
async function panFromCanvasCenter(
  page: Page,
  document: { width: number; height: number },
  point: { x: number; y: number }
) {
  const bounds = (await stage(page).boundingBox())!;
  const start = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await stage(page).dispatchEvent('pointermove', {
    clientX: start.x + document.width / 2 - point.x,
    clientY: start.y + document.height / 2 - point.y,
    pointerId: 1
  });
  await page.mouse.up();
}

/** Verifies rendered content, independent of the CSS transparency checkerboard. */
async function hasVisiblePixels(page: Page) {
  return page.getByRole('img', { name: 'Our render', exact: true }).evaluate((canvas: HTMLCanvasElement) => {
    const copy = document.createElement('canvas');
    copy.width = canvas.width;
    copy.height = canvas.height;
    const context = copy.getContext('2d')!;
    context.drawImage(canvas, 0, 0);
    const data = context.getImageData(0, 0, copy.width, copy.height).data;
    return data.some((value, index) => index % 4 !== 3 && value !== 48 && value !== 60);
  });
}

test.describe('display admission', () => {
  test.use({ deviceScaleFactor: 2 });

  test('keeps DPR 2 serial when two workers are requested', async ({ page }) => {
    await page.goto('/?workers=2');
    await page.locator('input[accept=".psd,.psb"]').setInputFiles({
      name: 'retina-admission.psb',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from(largePsb())
    });
    await expect(stage(page)).toHaveAttribute('data-render-source', 'layers');
    await expect(stage(page)).toHaveAttribute('data-busy', 'false');
    await page.getByRole('button', { name: '100%', exact: true }).click();
    await expect(stage(page)).toHaveAttribute('data-busy', 'false');
    expect(page.workers()).toHaveLength(1);
    await expect(page.getByRole('combobox', { name: 'Tile workers' })).toHaveValue('2');
  });
});
