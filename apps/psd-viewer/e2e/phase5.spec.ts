import { expect, test } from '@playwright/test';
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';

const root = process.env.PSD_TEXT_MIXER_RESEARCH_ROOT;
const rgb16 = `${root}/fixtures/psd/oracle-1/DSC_2530-1_2021-11-21-e28014496f83-g0/source-input/document.psd`;
const paths = `${root}/fixtures/psd/carriers-1/paths.psd`;
const screens = '/tmp/psd-phase5b-screens';

/** A real huge file must reach useful saved pixels without a complete UI buffer or compressed WASM copy. */
test('navigates the 6000x4000 RGB16 source through bounded native reads', async ({ page }) => {
  test.skip(!existsSync(rgb16), 'Requires the public RGB16 fixture.');
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const observed: { memory: number[]; reads: number[] } = { memory: [], reads: [] };
    (window as unknown as { sourceMetrics: typeof observed }).sourceMetrics = observed;
    const NativeWorker = Worker;
    window.Worker = class extends NativeWorker {
      constructor(...args: ConstructorParameters<typeof Worker>) {
        super(...args);
        this.addEventListener('message', (event) => {
          if (event.data.memory) {
            observed.memory.push(event.data.memory.wasmBytes);
          }
          for (const sample of event.data.performance ?? []) {
            if (sample.name === 'source.read.max') {
              observed.reads.push(sample.value);
            }
          }
        });
      }
    };
    const original = Blob.prototype.arrayBuffer;
    Blob.prototype.arrayBuffer = function () {
      if (this.size > 128 * 1024 ** 2) {
        throw new Error('Unexpected whole-file UI ArrayBuffer');
      }
      return original.call(this);
    };
  });
  await page.goto('/?telemetry=1');
  await page.locator('input[accept=".psd,.psb"]').setInputFiles(rgb16);
  const stage = page.locator('[data-busy]');
  await expect(stage).toHaveAttribute('data-render-source', 'savedComposite', { timeout: 90000 });
  await expect(stage).toHaveAttribute('data-busy', 'false', { timeout: 90000 });
  await expect(page.locator('footer')).toContainText('6000 × 4000 · 16-bit RGB');
  await expect(page.locator('footer')).toContainText('may be stale');
  await page.getByRole('button', { name: '100%', exact: true }).click();
  await expect(stage).toHaveAttribute('data-render-step', '1');
  await expect(stage).toHaveAttribute('data-busy', 'false', { timeout: 60000 });
  await expect(page.getByLabel('Document diagnostics', { exact: true })).not.toHaveAttribute('open');
  const badge = page.getByLabel('Canvas render status');
  await expect(badge).toContainText('Possibly stale saved pixels');
  expect((await badge.boundingBox())!.height).toBeLessThan(24);
  await mkdir(screens, { recursive: true });
  await page.screenshot({ path: `${screens}/huge-rgb16.png` });
  const metrics = await page.evaluate(() => {
    const observed = (window as unknown as { sourceMetrics: { memory: number[]; reads: number[] } }).sourceMetrics;
    return { wasmHighWater: Math.max(...observed.memory), largestHostRead: Math.max(...observed.reads) };
  });
  expect(metrics.wasmHighWater).toBeLessThan(64 * 1024 ** 2);
  expect(metrics.largestHostRead).toBeLessThanOrEqual(12000);
  expect(errors).toEqual([]);
  await test.info().attach('source-memory', { body: JSON.stringify(metrics), contentType: 'application/json' });
  console.log(JSON.stringify({ sourceRgb16: metrics }));
});

test('draws saved cubic paths and knots in the composite camera space', async ({ page }) => {
  test.skip(!existsSync(paths), 'Requires the saved paths fixture.');
  await page.goto('/');
  await page.locator('input[accept=".psd,.psb"]').setInputFiles(paths);
  await expect(page.locator('[data-busy]')).toHaveAttribute('data-busy', 'false');
  await page.getByText('Pixel, masks, channels and paths', { exact: true }).click();
  await page.getByRole('button', { name: 'List saved paths' }).click();
  const choice = page.getByRole('button', { name: /subpaths/ }).first();
  await expect(choice).toBeVisible();
  await choice.click();
  const overlay = page.getByLabel('Saved path overlay');
  await expect(overlay).toBeVisible();
  expect(await overlay.locator('path').count()).toBeGreaterThan(0);
  expect(await overlay.locator('circle').count()).toBeGreaterThan(0);
  const stage = page.locator('[data-busy]');
  const camera = await stage.evaluate((element) => ({
    x: element.getAttribute('data-camera-x'),
    y: element.getAttribute('data-camera-y'),
    scale: element.getAttribute('data-camera-scale')
  }));
  await expect(overlay.locator('g').first()).toHaveAttribute(
    'transform',
    `translate(${camera.x} ${camera.y}) scale(${camera.scale})`
  );
  const raw = await readFile(paths);
  const headerWidth = raw.readUInt32BE(18);
  const headerHeight = raw.readUInt32BE(14);
  let offset = 30 + raw.readUInt32BE(26);
  const end = offset + 4 + raw.readUInt32BE(offset);
  offset += 4;
  const anchors: number[][] = [];
  while (offset < end) {
    const id = raw.readUInt16BE(offset + 4);
    offset += 6;
    offset += Math.ceil((raw[offset]! + 1) / 2) * 2;
    const length = raw.readUInt32BE(offset);
    offset += 4;
    if (id === 2000) {
      for (let record = offset; record + 26 <= offset + length; record += 26) {
        if ([1, 2, 4, 5].includes(raw.readUInt16BE(record))) {
          anchors.push([
            (raw.readInt32BE(record + 14) * headerWidth) / 2 ** 24,
            (raw.readInt32BE(record + 10) * headerHeight) / 2 ** 24
          ]);
        }
      }
    }
    offset += Math.ceil(length / 2) * 2;
  }
  expect(anchors).toEqual([
    [2 - 2 ** -21, 2],
    [21, 2],
    [21, 14],
    [2 - 2 ** -21, 14]
  ]);
  for (const zoom of ['fit', 'actual']) {
    if (zoom === 'actual') {
      await page.getByRole('button', { name: '100%', exact: true }).click();
    }
    const actual = await overlay.locator('circle').evaluateAll((circles) =>
      circles.map((circle) => {
        const point = (circle as SVGCircleElement).ownerSVGElement!.createSVGPoint();
        point.x = Number(circle.getAttribute('cx'));
        point.y = Number(circle.getAttribute('cy'));
        const screen = point.matrixTransform((circle as SVGCircleElement).getScreenCTM()!);
        return [screen.x, screen.y];
      })
    );
    const origin = (await stage.boundingBox())!;
    const view = await stage.evaluate((element) => ({
      x: Number((element as HTMLElement).dataset.cameraX),
      y: Number((element as HTMLElement).dataset.cameraY),
      scale: Number((element as HTMLElement).dataset.cameraScale)
    }));
    actual.forEach(([x, y], index) => {
      expect(x).toBeCloseTo(origin.x + view.x + anchors[index]![0]! * view.scale, 3);
      expect(y).toBeCloseTo(origin.y + view.y + anchors[index]![1]! * view.scale, 3);
    });
    if (zoom === 'fit') {
      await mkdir(screens, { recursive: true });
      await page.screenshot({ path: `${screens}/saved-path-overlay.png` });
    }
  }
});

/** Keep a bounded saved-view option for the huge PSB alongside the explicit current-layer benchmark path. */
test('opens the huge PSB with a host-owned source and bounded saved regions', async ({ page }) => {
  const file = process.env.PSD_LARGE_PSB;
  test.skip(!file || !existsSync(file), 'Requires the public large PSB.');
  test.setTimeout(120000);
  await page.goto('/?telemetry=1');
  await page.locator('input[accept=".psd,.psb"]').setInputFiles(file!);
  await expect(page.locator('[data-busy]')).toHaveAttribute('data-render-source', 'savedComposite', { timeout: 90000 });
  await expect(page.locator('[data-busy]')).toHaveAttribute('data-busy', 'false', { timeout: 90000 });
  await expect(page.getByRole('button', { name: 'Render current layers', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '100%', exact: true }).click();
  await expect(page.locator('[data-busy]')).toHaveAttribute('data-busy', 'false', { timeout: 60000 });
  await mkdir(screens, { recursive: true });
  const stage = page.locator('[data-busy]');
  const bounds = (await stage.boundingBox())!;
  const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await stage.dispatchEvent('pointermove', {
    pointerId: 1,
    clientX: center.x + 30806 / 2 - 5200,
    clientY: center.y + 45624 / 2 - 7900
  });
  await page.mouse.up();
  await expect(stage).toHaveAttribute('data-busy', 'false', { timeout: 60000 });
  await page.getByLabel('Document diagnostics', { exact: true }).locator('summary').first().click();
  await expect(page.getByLabel('Renderer status')).toHaveAttribute('data-render-state', 'saved');
  await expect(page.getByLabel('Renderer status')).not.toContainText('replacing with a fresh layer render');
  await page.getByLabel('Document diagnostics', { exact: true }).locator('summary').first().click();
  await page.screenshot({ path: `${screens}/huge-psb.png` });
});
