import { expect, test } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const screenshots = '/tmp/psd-phase7a-screens';

test('integer GPU compositing matches exhaustive byte grids for every admitted mode', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const module = '/e2e/compositeHarness.ts';
    return (await import(/* @vite-ignore */ module)).runGpuArithmetic();
  });
  await writeFile('/tmp/psd-phase7a-gpu-arithmetic.json', JSON.stringify(result, null, 2));
  expect(result.errors).toEqual([]);
  expect(result.results).toHaveLength(360);
  for (const scenario of result.results) {
    expect(scenario.differing, JSON.stringify(scenario)).toBe(0);
  }
});

test('fixture regions and visibility identities require zero RGBA differences from strict renderRegion', async ({
  page
}) => {
  test.setTimeout(180_000);
  const fixtures = ['../../../packages/psd/test/editor/flat-rgb8.psd', '../../../packages/psd/test/editor/masks.psd'];
  const root = process.env.PSD_TEXT_MIXER_RESEARCH_ROOT;
  if (root) {
    fixtures.push(
      ...[
        'oracle-1/FastGUI__Assets__NGUI__Examples__Atlases__Fantasy__Fantasy_Atlas-9dda5bba9b51-g0/native.psd',
        'oracle-1/gothicvania-cemetery-files__PSD__sprites__ghost-2b6946b965a5-g0/native-input/document.psd',
        'oracle-1/examples__files__replace_images-321f9abb3c96-g0/source-input/document.psd',
        'oracle-1/srcdata__graphics__Units__milk_maid__milkmaid01t006-aa56f01d3984-g1/forced.psd',
        'oracle-1/PSD__Object_5-f0e4c0f5452f-g1/native.psd',
        'oracle-1/GothicVania-town-files__PSD__sprites__hat-man-walk-0721f1f8d29d-g0/native-input/document.psd',
        'oracle-1/tests__cases__basic_data-0b7c97202ee2-g0/native-input/document.psd',
        'oracle-1/country-platform-files__country-platform-405bd58403e1-g0/source-input/document.psd',
        'oracle-1/srcdata__graphics__Units__native_armed__native_armed01t100-6684215d5ec7-g1/forced.psd',
        'oracle-1/gothicvania-cemetery-files__PSD__sprites__hero__hero-attack-8895584d82af-g1/native-input/document.psd',
        'oracle-1/play-store-icon-6b75ae61aec1-g0/native-input/document.psd',
        'oracle-1/PSD__Tile_1-1642e9e64d94-g1/forced.psd',
        'oracle-1/gothicvania-cemetery-files__PSD__sprites__hero__hero-idle-133e420f9e8c-g1/forced.psd',
        'oracle-1/gothicvania-cemetery-files__PSD__sprites__hell-gato-9864609d82ec-g0/source-input/document.psd',
        'oracle-2/confluence__ContentPanelMirror-879990310f8f-g0/native.psd',
        'oracle-2/confluence__ContentPanelMirror_Round-ea6594a190d5-g0/forced.psd',
        'oracle-2/resources__users-43b5b08677a5-g1/native.psd',
        'am-oracle-1/p12-adjustment-no-adjustment-levels-g0-native.psd',
        'oracle-1/PSD__Object_3-57be6eddd73f-g0/native-input/document.psd',
        'oracle-1/srcdata__graphics__Units__galleon__boat_galleont100-53a701f53979-g0/source-input/document.psd'
      ].map((file) => `${root}/fixtures/psd/${file}`)
    );
  }
  await page.goto('/');
  const results = [];
  for (const fixture of fixtures) {
    const bytes = [...(await readFile(fixture.startsWith('/') ? fixture : new URL(fixture, import.meta.url)))];
    const scenarios = await page.evaluate(async (bytes) => {
      const module = '/e2e/compositeHarness.ts';
      return (await import(/* @vite-ignore */ module)).runGpuFixture(bytes);
    }, bytes);
    for (const scenario of scenarios) {
      if ('differing' in scenario) {
        expect(scenario.differing, `${fixture}: ${JSON.stringify(scenario)}`).toBe(0);
      }
    }
    results.push({ fixture, scenarios });
  }
  await writeFile('/tmp/psd-phase7a-gpu-fixtures.json', JSON.stringify(results, null, 2));
  expect(results.flatMap((r) => r.scenarios).filter((s) => 'differing' in s).length).toBeGreaterThan(30);
});

test('experimental preview labeling, zero-sample verification and forced mismatch fallback', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await mkdir(screenshots, { recursive: true });
  await page.goto('/?gpuComposite=1&telemetry=1');
  const bytes = await page.evaluate(async () => {
    const module = '/e2e/compositeHarness.ts';
    return (await import(/* @vite-ignore */ module)).createCompositeFixture(768, 512, 4);
  });
  // Retain the real worker result briefly so both fidelity states can be inspected without racing a frame.
  await page.addInitScript(() => {
    const devices: GPUDevice[] = [];
    Reflect.set(window, '__compositeDevices', devices);
    const requestDevice = GPUAdapter.prototype.requestDevice;
    GPUAdapter.prototype.requestDevice = async function (...args) {
      const device = await requestDevice.apply(this, args);
      devices.push(device);
      return device;
    };
    const Native = Worker;
    window.Worker = class extends Native {
      postMessage(message: unknown, transfer: Transferable[] | StructuredSerializeOptions = []) {
        if (
          Reflect.get(window, '__holdCapabilities') &&
          typeof message === 'object' &&
          message &&
          Reflect.get(message, 'type') === 'capability'
        ) {
          return;
        }
        if (typeof message === 'object' && message && Reflect.get(message, 'type') === 'renderWindow') {
          setTimeout(
            () =>
              Array.isArray(transfer) ? super.postMessage(message, transfer) : super.postMessage(message, transfer),
            200
          );
        } else {
          if (Array.isArray(transfer)) {
            super.postMessage(message, transfer);
          } else {
            super.postMessage(message, transfer);
          }
        }
      }
    };
  });
  for (const mismatch of [false, true]) {
    await page.goto(`/?gpuComposite=1&telemetry=1${mismatch ? '&gpuMismatch=1' : ''}`);
    await page
      .locator('input[type=file]')
      .first()
      .setInputFiles({ name: 'gpu-stack.psd', mimeType: 'image/vnd.adobe.photoshop', buffer: Buffer.from(bytes) });
    if (!mismatch) {
      await expect(page.getByRole('status', { name: 'Canvas render status' })).toContainText('GPU interactive preview');
      await page.screenshot({ path: `${screenshots}/gpu-preview.png` });
    }
    if (mismatch) {
      await expect(page.getByLabel('GPU compositing diagnostics')).toContainText('GPU mismatch');
      await expect(page.locator('[data-busy]')).toHaveAttribute('data-busy', 'false');
      await page.screenshot({ path: `${screenshots}/forced-mismatch-diagnostics.png` });
      await writeFile(
        '/tmp/psd-phase7a-forced-mismatch.json',
        JSON.stringify(await page.getByLabel('GPU compositing diagnostics').textContent())
      );
      await page.locator('[role=tree] input[type=checkbox]').first().click();
      await expect(page.getByLabel('GPU compositing diagnostics')).toContainText('disabled');
    } else {
      await expect(page.getByLabel('GPU compositing diagnostics')).toContainText('verified');
      await expect(page.getByRole('status', { name: 'Canvas render status' })).toContainText('Strict CPU tiles');
      await expect(page.locator('[data-busy]')).toHaveAttribute('data-busy', 'false');
      await page.screenshot({ path: `${screenshots}/strict-verified.png` });
      // Resident GPU previews must not wait for the authoritative worker's planning queue.
      await page.evaluate(() => Reflect.set(window, '__holdCapabilities', true));
      await page.locator('[role=tree] input[type=checkbox]').first().click();
      await expect(page.getByRole('status', { name: 'Canvas render status' })).toContainText('GPU interactive preview');
      await expect(page.locator('[data-busy]')).toHaveAttribute('data-busy', 'false');
      await page.evaluate(() => Reflect.set(window, '__holdCapabilities', false));
      await page.evaluate(() => Reflect.get(window, '__compositeDevices').at(-1).destroy());
      await expect(page.locator('canvas[data-backend=canvas2d]')).toBeVisible();
      await page.locator('[role=tree] input[type=checkbox]').first().click();
      await expect(page.getByLabel('GPU compositing diagnostics')).toContainText('disabled');
      await expect(page.locator('[data-busy]')).toHaveAttribute('data-busy', 'false');
      await expect(page.getByRole('status', { name: 'Canvas render status' })).toContainText('Strict CPU tiles');
      await page.getByRole('button', { name: 'Retry WebGPU' }).click();
      await expect(page.locator('canvas[data-backend=webgpu]')).toBeVisible();
    }
    await expect(page.locator('[data-busy]')).toHaveAttribute('data-busy', 'false');
  }
  expect(errors).toEqual([]);
});
