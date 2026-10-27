import { expect, test } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const screenshots = '/tmp/psd-phase7b-screens';

test('integer GPU compositing matches exhaustive byte grids for every admitted mode', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const module = '/e2e/compositeHarness.ts';
    return (await import(/* @vite-ignore */ module)).runGpuArithmetic();
  });
  await writeFile('/tmp/psd-phase7b-gpu-arithmetic.json', JSON.stringify(result, null, 2));
  expect(result.errors).toEqual([]);
  expect(result.results).toHaveLength(480);
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
        'oracle-1/Demo_Project__MOOMaskedIconView_Demo__Images__Icons__PSDs__Eye-820703ece35b-g1/native.psd',
        'oracle-1/Demo_Project__MOOMaskedIconView_Demo__Images__Icons__PSDs__Rounded_Rect-425d767c06f1-g0/native-input/document.psd',
        'oracle-1/tests__fixtures__clipping__pixel-with-blend-e6d8f722bf9b-g0/native.psd',
        'oracle-1/tests__fixtures__clipping__clipping-2-vector-with-transform-cad400aae019-g0/forced.psd',
        'oracle-1/test-fixtures__psd__photoshop-text-rtl-hebrew-2a7cfb4332bb-g1/native.psd',
        'oracle-1/tests__PsdSharp.Tests__PSDs__LayersAndMasks-8aa75fead08c-g1/native.psd',
        'am-oracle-1/p12-adjustment-no-adjustment-levels-g0-native.psd',
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
  await writeFile('/tmp/psd-phase7b-gpu-fixtures.json', JSON.stringify(results, null, 2));
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
  // Retain real verification requests until the preview is observed, then release them for exact checking.
  await page.addInitScript(() => {
    const devices: GPUDevice[] = [];
    Reflect.set(window, '__compositeDevices', devices);
    const requestDevice = GPUAdapter.prototype.requestDevice;
    GPUAdapter.prototype.requestDevice = async function (...args) {
      const device = await requestDevice.apply(this, args);
      devices.push(device);
      return device;
    };
    const pendingWindows: (() => void)[] = [];
    Reflect.set(window, '__holdWindows', true);
    Reflect.set(window, '__releaseWindows', () => {
      Reflect.set(window, '__holdWindows', false);
      for (const send of pendingWindows.splice(0)) {
        send();
      }
    });
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
          const send = () =>
            Array.isArray(transfer) ? super.postMessage(message, transfer) : super.postMessage(message, transfer);
          if (Reflect.get(window, '__holdWindows')) {
            pendingWindows.push(send);
          } else {
            send();
          }
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
    // Hold strict replies until the real GPU frame is observable, independent of machine load.
    await expect(page.getByRole('status', { name: 'Canvas render status' })).toContainText('GPU interactive preview');
    if (!mismatch) {
      await page.screenshot({ path: `${screenshots}/gpu-preview.png` });
    }
    await page.evaluate(() => Reflect.get(window, '__releaseWindows')());
    if (mismatch) {
      await expect(page.getByLabel('GPU compositing diagnostics')).toContainText('GPU mismatch');
      await expect(page.locator('[data-busy]')).toHaveAttribute('data-busy', 'false');
      await expect(page.getByLabel('GPU mismatch summary')).toContainText('First difference at');
      await expect(page.getByRole('button', { name: 'Copy details', exact: true })).toBeVisible();
      await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
      await page.getByRole('button', { name: 'Copy details', exact: true }).click();
      await expect(page.getByLabel('GPU mismatch summary').getByRole('status')).toHaveText('Copied');
      const copied = await page.evaluate(() => navigator.clipboard.readText());
      expect(JSON.parse(copied).mismatches[0].tile).toHaveProperty('width');
      await expect(page.getByLabel('GPU compositing diagnostics').locator('pre')).toHaveCount(0);
      await page.screenshot({ path: `${screenshots}/forced-mismatch-diagnostics.png` });
      await writeFile(
        '/tmp/psd-phase7b-forced-mismatch.json',
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
      await page.evaluate(() => {
        Reflect.set(window, '__holdCapabilities', true);
        Reflect.set(window, '__holdWindows', true);
      });
      await page.locator('[role=tree] input[type=checkbox]').first().click();
      await expect(page.getByRole('status', { name: 'Canvas render status' })).toContainText('GPU interactive preview');
      await expect(page.locator('[data-busy]')).toHaveAttribute('data-busy', 'false');
      await page.evaluate(() => {
        Reflect.set(window, '__holdCapabilities', false);
        Reflect.get(window, '__releaseWindows')();
      });
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

test('clipping and adjustment arithmetic controls match strict RGBA on the GPU', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/');
  const results: Awaited<ReturnType<typeof import('./compositeHarness').runGpuOperandControls>> = await page.evaluate(
    async () => {
      const module = '/e2e/compositeHarness.ts';
      return (await import(/* @vite-ignore */ module)).runGpuOperandControls();
    }
  );
  await writeFile('/tmp/psd-phase7b-gpu-operands.json', JSON.stringify(results, null, 2));
  for (const control of results) {
    expect(
      control.scenarios.some((scenario) => 'differing' in scenario),
      control.name
    ).toBe(true);
    for (const scenario of control.scenarios) {
      expect('differing' in scenario ? scenario.differing : scenario.refused, control.name).toBe(0);
    }
  }
});

test('shows a widened cached-text document with verified GPU compositing', async ({ page }) => {
  const root = process.env.PSD_TEXT_MIXER_RESEARCH_ROOT;
  test.skip(!root, 'Requires the read-only research fixture corpus.');
  await page.goto('/?gpuComposite=1&telemetry=1');
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles(
      `${root}/fixtures/psd/oracle-1/test-fixtures__psd__photoshop-text-rtl-hebrew-2a7cfb4332bb-g1/native.psd`
    );
  await expect(page.getByLabel('GPU compositing diagnostics')).toContainText('verified');
  await expect(page.locator('[data-busy]')).toHaveAttribute('data-busy', 'false');
  await page.getByRole('button', { name: '100%', exact: true }).click();
  await expect(page.locator('[data-busy]')).toHaveAttribute('data-busy', 'false');
  await page.screenshot({ path: `${screenshots}/widened-text.png` });
});
