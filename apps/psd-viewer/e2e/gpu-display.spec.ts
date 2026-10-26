import { expect, test } from '@playwright/test';
import { largePsb } from '../../../packages/psd/test/largePsb';

for (const dpr of [1, 2]) {
  test(`GPU readback matches strict CPU pixels, alpha, orientation and bordered filtering at DPR ${dpr}`, async ({
    page
  }) => {
    await page.goto('/?telemetry=1');
    const result = await page.evaluate(async (dpr) => {
      const module = '/e2e/gpuHarness.ts';
      const { runReadbacks } = await import(/* @vite-ignore */ module);
      return runReadbacks(dpr);
    }, dpr);
    expect(result.errors).toEqual([]);
    for (const scenario of result.results) {
      expect(scenario, JSON.stringify(scenario)).toMatchObject({ differences: 0 });
      if (scenario.name === '100%' || scenario.name === 'nearest 400%') {
        expect(scenario.max).toBe(0);
      }
    }
  });
}

test('uses resident textures on revisits and preserves the document through device destruction and retry', async ({
  page
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const devices: GPUDevice[] = [];
    Reflect.set(window, '__testDevices', devices);
    const request = GPUAdapter.prototype.requestDevice;
    GPUAdapter.prototype.requestDevice = async function (...args) {
      const device = await request.apply(this, args);
      devices.push(device);
      if (devices.length === 1) {
        let lose!: (info: Pick<GPUDeviceLostInfo, 'reason' | 'message'>) => void;
        Object.defineProperty(device, 'lost', {
          value: new Promise<Pick<GPUDeviceLostInfo, 'reason' | 'message'>>((resolve) => {
            lose = resolve;
          })
        });
        Reflect.set(window, '__loseGpu', () => lose({ reason: 'unknown', message: 'forced transient loss' }));
      }

      return device;
    };
  });
  await page.goto('/?telemetry=1');
  await page.getByRole('button', { name: 'Examples…' }).click();
  await page.getByRole('button', { name: /Adjustment stack/ }).click();
  await expect(page.locator('[data-busy]')).toHaveAttribute('data-busy', 'false');
  await expect(page.locator('canvas[data-backend=webgpu]')).toBeVisible();
  await page.waitForFunction(() => Reflect.get(window, '__testDevices').length > 0);
  // Wait for the final upload frame before measuring a resident-only camera gesture.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.evaluate(() => {
    const uploads: PerformanceEntry[] = [];
    Reflect.set(window, '__testUploads', uploads);
    new PerformanceObserver((list) =>
      uploads.push(...list.getEntries().filter((entry) => entry.name === 'psd:upload'))
    ).observe({ type: 'measure' });
  });
  await page.getByRole('button', { name: '100%', exact: true }).click();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await page.getByRole('button', { name: 'Fit', exact: true }).click();
  expect(await page.evaluate(() => Reflect.get(window, '__testUploads').length)).toBe(0);
  const render = await page.locator('[data-render-id]').getAttribute('data-render-id');
  await page.evaluate(() => Reflect.get(window, '__loseGpu')());
  await expect.poll(() => page.evaluate(() => Reflect.get(window, '__testDevices').length)).toBe(2);
  await expect(page.locator('canvas[data-backend=webgpu]')).toBeVisible();
  await expect(page.locator('[data-render-id]')).toHaveAttribute('data-render-id', render!);
  await page.evaluate(() => Reflect.get(window, '__testDevices').at(-1).destroy());
  await expect(page.locator('canvas[data-backend=canvas2d]')).toBeVisible();
  await expect(page.locator('[data-render-id]')).toHaveAttribute('data-render-id', render!);
  await page.getByRole('button', { name: '100%', exact: true }).click();
  await page.getByRole('button', { name: 'Retry WebGPU' }).click();
  await expect(page.locator('canvas[data-backend=webgpu]')).toBeVisible();
  await expect(page.locator('canvas[data-backend=canvas2d]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('forced 2D and unavailable WebGPU both show pixels and permit visibility changes', async ({ page }) => {
  for (const mode of ['forced', 'unavailable']) {
    if (mode === 'unavailable') {
      await page.addInitScript(() => Object.defineProperty(navigator, 'gpu', { value: undefined }));
    }

    await page.goto(mode === 'forced' ? '/?backend=canvas2d' : '/');
    await page.getByRole('button', { name: 'Examples…' }).click();
    await page.getByRole('button', { name: /Adjustment stack/ }).click();
    await expect(page.locator('[data-busy]')).toHaveAttribute('data-busy', 'false');
    const canvas = page.locator('canvas[data-backend=canvas2d]');
    await expect(canvas).toBeVisible();
    await expect
      .poll(() =>
        canvas.evaluate((canvas: HTMLCanvasElement) =>
          canvas
            .getContext('2d')!
            .getImageData(0, 0, canvas.width, canvas.height)
            .data.some((value, index) => index % 4 !== 3 && value !== 48 && value !== 60)
        )
      )
      .toBe(true);
    const before = await page.locator('[data-render-id]').getAttribute('data-render-id');
    await page.locator('[role=tree] input[type=checkbox]').first().click();
    await expect(page.locator('[data-render-id]')).not.toHaveAttribute('data-render-id', before!);
  }
});

test('revisits retained window coverage without worker calls or GPU uploads', async ({ page }) => {
  await page.addInitScript(() => {
    const audit = { requests: 0, uploads: 0 };
    Reflect.set(window, '__tileRevisit', audit);
    const NativeWorker = Worker;
    window.Worker = class extends NativeWorker {
      postMessage(message: { type: string }, options: Transferable[] | StructuredSerializeOptions = []) {
        if (message.type === 'renderWindow') {
          audit.requests++;
        }

        if (Array.isArray(options)) {
          super.postMessage(message, options);
        } else {
          super.postMessage(message, options);
        }
      }
    };
    new PerformanceObserver((list) => {
      audit.uploads += list.getEntries().filter((entry) => entry.name === 'psd:upload').length;
    }).observe({ type: 'measure' });
  });
  await page.goto('/?telemetry=1');
  await page.locator('input[accept=".psd,.psb"]').setInputFiles({
    name: 'retained-coverage.psb',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from(largePsb())
  });
  const settle = async () => {
    await expect(page.locator('[data-busy]')).toHaveAttribute('data-busy', 'false');
    await page.evaluate(async () => {
      for (let frame = 0; frame < 8; frame++) {
        await new Promise(requestAnimationFrame);
      }
    });
  };
  await settle();
  await page.getByRole('button', { name: '100%', exact: true }).click();
  await settle();
  await expect(page.locator('canvas[data-backend=webgpu]')).toBeVisible();
  const before = await page.evaluate(() => ({ ...Reflect.get(window, '__tileRevisit') }));
  expect(before.uploads).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await settle();
  await page.getByRole('button', { name: '100%', exact: true }).click();
  await settle();
  expect(await page.evaluate(() => Reflect.get(window, '__tileRevisit'))).toEqual(before);
});
