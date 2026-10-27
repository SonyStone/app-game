import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const asset = (name: string) => fileURLToPath(new URL(`../src/features/examples/assets/${name}`, import.meta.url));

test('search, keyboard tree selection, reveal, solo/reset and canvas navigation', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[accept=".psd,.psb"]').setInputFiles(asset('pass-through-groups.psd'));
  await expect(page.locator('[data-busy]')).toHaveAttribute('data-render-id', /\d+/);
  await expect(page.locator('[data-busy]')).toHaveAttribute('data-busy', 'false');
  await page.getByRole('button', { name: 'Expand all', exact: true }).click();
  const tree = page.getByRole('tree', { name: 'Layers', exact: true });
  await tree.focus();
  await tree.press('Home');
  await expect(tree.getByRole('treeitem').first()).toHaveAttribute('aria-selected', 'true');
  await tree.press('ArrowLeft');
  await tree.press('ArrowRight');
  await tree.press('ArrowDown');
  await tree.press('Enter');
  await expect(page.getByRole('img', { name: 'Selected layer saved bounds' })).toBeVisible();
  await page.getByRole('button', { name: 'Fit layer', exact: true }).click();
  await page.getByRole('button', { name: 'Solo', exact: true }).click();
  await page.getByRole('button', { name: 'Reset visibility', exact: true }).click();
  const canvas = page.locator('[data-busy]');
  await canvas.focus();
  const x = await canvas.getAttribute('data-camera-x');
  await canvas.press('ArrowRight');
  await expect(canvas).not.toHaveAttribute('data-camera-x', x!);
  await page.getByRole('spinbutton', { name: 'Zoom percentage' }).fill('200');
  await page.getByRole('spinbutton', { name: 'Zoom percentage' }).press('Enter');
  await expect.poll(async () => Number(await canvas.getAttribute('data-camera-scale'))).toBeCloseTo(2);
  await page.getByText('Navigator', { exact: true }).click();
  await page.getByRole('button', { name: 'Center canvas using navigator' }).click();
  await page.getByRole('searchbox', { name: 'Search layers' }).fill('not a layer');
  await expect(tree.getByRole('treeitem')).toHaveCount(0);
});

test('state stepping and bounded playback expose saved-record inspection', async ({ page }) => {
  await page.goto('/');
  await page
    .locator('input[accept=".psd,.psb"]')
    .setInputFiles(fileURLToPath(new URL('../tests/assets/frames.psd', import.meta.url)));
  await expect(page.locator('[data-busy]')).toHaveAttribute('data-render-id', /\d+/);
  await page.getByRole('button', { name: 'Next state' }).click();
  await expect(page.getByLabel('Show', { exact: true })).toHaveValue(/frame:/);
  await page.getByRole('button', { name: 'Previous state' }).click();
  await page.getByRole('checkbox', { name: 'Loop', exact: true }).check();
  const previousState = await page.getByLabel('Show', { exact: true }).inputValue();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await expect(page.getByLabel('Show', { exact: true })).not.toHaveValue(previousState);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.getByText(/Layer properties and bounds show saved records/)).toBeVisible();
});

test('saved masks, native channels and typed paths are explicitly labeled', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[accept=".psd,.psb"]').setInputFiles(asset('adjustment-stack.psd'));
  await expect(page.locator('[data-busy]')).toHaveAttribute('data-render-id', /\d+/);
  await page.getByText('Pixel, masks, channels and paths', { exact: true }).click();
  await page.getByRole('button', { name: 'Load saved channels' }).click();
  await expect(page.getByRole('img', { name: 'Saved channel preview' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Saved channel', exact: true }).selectOption('1');
  await page.locator('[data-busy]').hover();
  await expect(page.getByRole('status', { name: 'Pixel inspection' })).toContainText('RGBA');
  await expect(page.getByLabel('Saved native sample')).toContainText('Saved native value');
  await page.getByRole('button', { name: 'List saved paths' }).click();
  await expect(page.getByText(/Select a path to overlay its saved curves/)).toBeVisible();
  await page.locator('[data-layer-index="1"]').click();
  await expect(page.getByRole('combobox', { name: 'Mask view', exact: true })).toBeEnabled();
  await page.getByRole('combobox', { name: 'Mask view', exact: true }).selectOption('overlay');
  await expect(page.getByRole('img', { name: 'Saved mask red overlay' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Mask view', exact: true }).selectOption('only');
  await expect(page.getByText(/Saved-record properties and pixels/)).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('mask-inspection.png') });
});

test('comparison wipe/blink and mismatch navigation describe current versus saved state', async ({ page }) => {
  await page.addInitScript(() => {
    const Native = Worker;
    window.Worker = class extends Native {
      constructor(...args: ConstructorParameters<typeof Worker>) {
        super(...args);
        this.addEventListener('message', (event) => {
          if (event.data.type === 'rendered') {
            Reflect.set(window, '__comparisonCurrent', event.data.render);
          } else if (event.data.type === 'merged') {
            Reflect.set(window, '__comparisonSaved', event.data.image);
          }
        });
      }
    };
  });
  await page.goto('/');
  await page.locator('input[accept=".psd,.psb"]').setInputFiles(asset('adjustment-stack.psd'));
  await expect(page.locator('[data-busy]')).toHaveAttribute('data-render-id', /\d+/);
  await page.getByRole('checkbox', { name: 'Visible: posterize' }).uncheck();
  await page.getByRole('button', { name: 'Split', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Comparison saved composite' })).toBeVisible();
  await expect(page.getByLabel('Comparison controls')).toContainText('1 transient visibility overrides');
  await expect(page.getByRole('button', { name: 'Next mismatch' })).toBeEnabled();
  const canvas = page.locator('[data-busy]');
  const x = await canvas.getAttribute('data-camera-x');
  await page.getByRole('button', { name: 'Next mismatch' }).click();
  await expect(canvas).not.toHaveAttribute('data-camera-x', x!);
  await page.getByRole('button', { name: 'Wipe', exact: true }).click();
  await page.getByRole('slider', { name: 'Wipe position' }).fill('30');
  await expect(page.locator('[style*="clip-path"]')).toHaveCSS('clip-path', 'inset(0px 0px 0px 30%)');
  await page.getByRole('button', { name: 'Fit', exact: true }).click();
  await page.getByText('Pixel, masks, channels and paths', { exact: true }).click();
  const sample = await page.evaluate(() => {
    const current = Reflect.get(window, '__comparisonCurrent') as { width: number; pixels: Uint8Array };
    const saved = Reflect.get(window, '__comparisonSaved') as typeof current;
    for (let offset = 0; offset < current.pixels.length; offset += 4) {
      if (current.pixels[offset] !== saved.pixels[offset]) {
        const index = offset / 4;
        return {
          x: index % current.width,
          y: Math.floor(index / current.width),
          current: Array.from(current.pixels.subarray(offset, offset + 4)),
          saved: Array.from(saved.pixels.subarray(offset, offset + 4))
        };
      }
    }
    throw new Error('Expected a display mismatch after hiding posterize');
  });
  const box = (await canvas.boundingBox())!;
  const camera = await canvas.evaluate((element) => ({
    x: Number(element.dataset.cameraX),
    y: Number(element.dataset.cameraY),
    scale: Number(element.dataset.cameraScale)
  }));
  await page.getByRole('slider', { name: 'Wipe position' }).fill('0');
  await page.mouse.move(
    box.x + camera.x + (sample.x + 0.5) * camera.scale,
    box.y + camera.y + (sample.y + 0.5) * camera.scale
  );
  await expect(page.getByRole('status', { name: 'Pixel inspection' })).toContainText(`RGBA ${sample.saved.join(', ')}`);
  await page.getByRole('slider', { name: 'Wipe position' }).fill('100');
  await expect(page.getByRole('status', { name: 'Pixel inspection' })).toContainText(
    `RGBA ${sample.current.join(', ')}`
  );
  await page.getByRole('slider', { name: 'Wipe position' }).fill('30');
  await page.getByText('Pixel, masks, channels and paths', { exact: true }).click();
  await page.screenshot({ path: test.info().outputPath('comparison-wipe.png') });
  await page.getByRole('button', { name: 'Blink', exact: true }).click();
  await expect(page.getByLabel('Comparison controls')).toContainText('600 ms');
  await page.getByRole('button', { name: 'Our render', exact: true }).click();
  await expect(page.getByLabel('Comparison controls')).toHaveCount(0);
});

test('exports display RGB8 current render, saved layer/mask, viewport, diagnostics and unchanged original', async ({
  page
}) => {
  const { readFile } = await import('node:fs/promises');
  await page.addInitScript(() => {
    const Native = Worker;
    window.Worker = class extends Native {
      constructor(...args: ConstructorParameters<typeof Worker>) {
        super(...args);
        this.addEventListener('message', (event) => {
          if (event.data.type === 'rendered') {
            const image = event.data.render;
            Reflect.set(window, '__exportPixels', {
              width: image.width,
              height: image.height,
              pixels: Array.from(image.pixels)
            });
          }
        });
      }
    };
  });
  await page.goto('/');
  const file = asset('adjustment-stack.psd');
  await page.locator('input[accept=".psd,.psb"]').setInputFiles(file);
  await expect(page.locator('[data-busy]')).toHaveAttribute('data-render-id', /\d+/);
  const first = await page.locator('[data-busy]').getAttribute('data-render-id');
  await page.getByRole('checkbox', { name: 'Visible: posterize' }).uncheck();
  await expect(page.locator('[data-busy]')).not.toHaveAttribute('data-render-id', first!);
  await page.locator('[data-layer-index="1"]').click();
  await page.getByText('Export and original download', { exact: true }).click();
  for (const name of [
    'Export full render PNG',
    'Export viewport PNG',
    'Export selected layer PNG',
    'Export selected mask PNG',
    'Download diagnostics',
    'Download unchanged original'
  ]) {
    if (name === 'Export selected layer PNG') {
      await page.locator('[data-layer-index="0"]').click();
    }
    if (name === 'Export selected mask PNG') {
      await page.locator('[data-layer-index="1"]').click();
    }
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name, exact: true }).click();
    const result = await download;
    const bytes = await readFile((await result.path())!);
    if (name === 'Download unchanged original') {
      expect(bytes).toEqual(await readFile(file));
    } else if (name === 'Download diagnostics') {
      expect(JSON.parse(bytes.toString()).originalUnchanged).toBe(true);
    } else {
      if (name === 'Export full render PNG') {
        const expected = await page.evaluate(
          () => Reflect.get(window, '__exportPixels') as { width: number; height: number; pixels: number[] }
        );
        const { inflateSync } = await import('node:zlib');
        const chunks: Buffer[] = [];
        for (let offset = 8; offset < bytes.length; ) {
          const length = bytes.readUInt32BE(offset);
          if (bytes.toString('ascii', offset + 4, offset + 8) === 'IDAT') {
            chunks.push(bytes.subarray(offset + 8, offset + 8 + length));
          }
          offset += 12 + length;
        }
        const raw = inflateSync(Buffer.concat(chunks));
        const pixels: number[] = [];
        for (let row = 0; row < expected.height; row++) {
          const start = row * (1 + expected.width * 4);
          expect(raw[start]).toBe(0);
          pixels.push(...raw.subarray(start + 1, start + 1 + expected.width * 4));
        }
        expect(pixels).toEqual(expected.pixels);
      }
      expect(result.suggestedFilename()).toContain('display-rgb8');
      expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    }
  }
});

test('finds and reveals a named layer among 350 records with a bounded DOM and unchanged source', async ({ page }) => {
  const { writePsd } = await import('@app-game/psd');
  const pixels = Uint8Array.of(70, 90, 110, 255);
  const bytes = await writePsd(
    {
      width: 1,
      height: 1,
      layers: Array.from({ length: 350 }, (_, i) => ({
        name: `Named record ${i}`,
        left: 0,
        top: 0,
        width: 1,
        height: 1,
        pixels,
        opacity: 1,
        visible: true,
        blend: 'normal',
        clipping: false,
        transparencyLocked: false
      }))
    },
    pixels
  );
  await page.goto('/');
  await page
    .locator('input[accept=".psd,.psb"]')
    .setInputFiles({ name: '350-records.psd', mimeType: 'application/octet-stream', buffer: Buffer.from(bytes) });
  await expect(page.locator('[data-busy]')).toHaveAttribute('data-render-id', /\d+/);
  const tree = page.getByRole('tree', { name: 'Layers', exact: true });
  expect(await tree.getByRole('treeitem').count()).toBeLessThan(80);
  await tree.evaluate((element) => {
    element.scrollTop = 7000;
  });
  await expect.poll(() => tree.evaluate((element) => element.scrollTop)).toBeGreaterThan(6000);
  await page.getByRole('combobox', { name: 'Filter layer kind' }).selectOption('pixel');
  await expect.poll(() => tree.evaluate((element) => element.scrollTop)).toBe(0);
  await expect(tree.getByRole('treeitem').first()).toBeInViewport();

  await page.getByRole('searchbox', { name: 'Search layers' }).fill('Named record 125');
  await expect(tree.getByRole('treeitem')).toHaveCount(1);
  await tree.focus();
  await tree.press('Home');
  await tree.press('Enter');
  await expect(page.locator('[data-layer-detail="125"]')).toContainText('Named record 125');
  await expect(page.getByRole('img', { name: 'Selected layer saved bounds' })).toBeVisible();
  await page.getByRole('button', { name: 'Solo', exact: true }).click();
  await page.getByRole('button', { name: 'Reset visibility', exact: true }).click();
  await page.screenshot({ path: test.info().outputPath('350-layer-search.png') });
  await page.getByText('Export and original download', { exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download unchanged original', exact: true }).click();
  const { readFile } = await import('node:fs/promises');
  expect(await readFile((await (await pending).path())!)).toEqual(Buffer.from(bytes));
});

for (const { mode, depth, values, unit } of [
  { mode: 3, depth: 32, values: [0.125, 0.5, 0.75], unit: 'float32 ULP' },
  { mode: 9, depth: 16, values: [30000, 32768, 32768], unit: '16-bit Lab level' },
  { mode: 4, depth: 16, values: [65535, 32000, 1000, 65535], unit: '16-bit CMYK level' }
]) {
  test(`small mode ${mode} depth ${depth} remains zero in native units`, async ({ page }) => {
    const bytes = new Uint8Array(40 + (values.length * depth) / 8);
    bytes.set([56, 66, 80, 83]);
    const view = new DataView(bytes.buffer);
    view.setUint16(4, 1);
    view.setUint16(12, values.length);
    view.setUint32(14, 1);
    view.setUint32(18, 1);
    view.setUint16(22, depth);
    view.setUint16(24, mode);
    values.forEach((value, i) =>
      depth === 32 ? view.setFloat32(40 + i * 4, value) : view.setUint16(40 + i * 2, value)
    );
    await page.goto('/');
    await page
      .locator('input[accept=".psd,.psb"]')
      .setInputFiles({ name: 'native.psd', mimeType: 'application/octet-stream', buffer: Buffer.from(bytes) });
    await expect(page.locator('[data-busy]')).toHaveAttribute('data-render-id', /\d+/);
    await page.getByRole('button', { name: 'Difference', exact: true }).click();
    const stats = page.getByRole('region', { name: 'Difference statistics' });
    await expect(stats).toHaveAttribute('data-mismatches', '0');
    await expect(stats).toContainText(unit);
  });
}

test('explains a refused layer preview and disables its PNG export', async ({ page }) => {
  await page.addInitScript(() => {
    const Native = Worker;
    window.Worker = class extends Native {
      constructor(...args: ConstructorParameters<typeof Worker>) {
        super(...args);
        this.addEventListener('message', (event) => {
          if (event.data.type === 'layer') {
            event.data.pixels = {
              ok: false,
              error: { kind: 'unsupported', message: 'This layer is too large for a whole-layer preview.' }
            };
          }
        });
      }
    };
  });
  await page.goto('/');
  await page.locator('input[accept=".psd,.psb"]').setInputFiles(asset('adjustment-stack.psd'));
  await expect(page.locator('[data-busy]')).toHaveAttribute('data-render-id', /\d+/);
  await page.locator('[data-layer-index="0"]').click();
  await expect(page.getByText(/Saved layer pixel preview unavailable: This layer is too large/)).toBeVisible();
  await page.getByText('Export and original download', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Export selected layer PNG', exact: true })).toBeDisabled();
});
