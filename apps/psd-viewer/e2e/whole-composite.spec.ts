import { expect, test } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';

/** GPU previews must leave small-document comparison and export identities on the strict whole renderer. */
test('small GPU documents keep whole-render comparisons and strict PNG exports after edits', async ({ page }) => {
  const screenshots = '/tmp/psd-phase7c-screens';
  await mkdir(screenshots, { recursive: true });
  await page.addInitScript(() => {
    const audit = { windows: 0, pixels: [] as number[] };
    Reflect.set(window, '__wholeComposite', audit);
    const Native = Worker;
    window.Worker = class extends Native {
      constructor(...args: ConstructorParameters<typeof Worker>) {
        super(...args);
        this.addEventListener('message', ({ data }) => {
          if (data.type === 'rendered') {
            audit.pixels = Array.from(data.render.pixels);
          }
        });
      }
      postMessage(message: { type: string }, options: Transferable[] | StructuredSerializeOptions = []) {
        if (message.type === 'renderWindow') {
          audit.windows++;
        }
        if (Array.isArray(options)) {
          super.postMessage(message, options);
        } else {
          super.postMessage(message, options);
        }
      }
    };
  });
  await page.goto('/?gpuComposite=1&telemetry=1');
  const bytes = await page.evaluate(async () => {
    const module = '/e2e/compositeHarness.ts';
    return (await import(/* @vite-ignore */ module)).createCompositeFixture(64, 48, 3);
  });
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({
      name: 'small-gpu.psd',
      mimeType: 'image/vnd.adobe.photoshop',
      buffer: Buffer.from(bytes)
    });
  const stage = page.locator('[data-busy]');
  await expect(page.getByRole('checkbox', { name: 'GPU compositing', exact: true })).toBeChecked();
  await expect(page.getByLabel('GPU compositing diagnostics').locator('summary')).toContainText(
    'last comparison verified'
  );
  await expect(stage).toHaveAttribute('data-busy', 'false');
  await page.getByRole('button', { name: 'Wipe', exact: true }).click();
  await expect(stage).toHaveAttribute('data-view', 'wipe');
  const previous = await stage.getAttribute('data-render-id');
  await page.locator('[role=tree] input[type=checkbox]').first().click();
  await expect(stage).not.toHaveAttribute('data-render-id', previous!);
  await expect(stage).toHaveAttribute('data-busy', 'false');
  await expect(page.getByLabel('Comparison controls')).toContainText('1 transient visibility overrides');
  await expect(page.getByRole('button', { name: 'Next mismatch' })).toBeEnabled();
  await page.screenshot({ path: `${screenshots}/small-gpu-wipe.png` });
  await page.getByRole('button', { name: 'Our render', exact: true }).click();
  await expect(stage).toHaveAttribute('data-busy', 'false');
  await expect(page.getByLabel('GPU compositing diagnostics').locator('summary')).toContainText(
    'last comparison verified'
  );
  await page.screenshot({ path: `${screenshots}/small-gpu-after-toggle.png` });
  await page.getByText('Export and original download', { exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export full render PNG', exact: true }).click();
  const png = await readFile((await (await download).path())!);
  const chunks: Buffer[] = [];
  for (let offset = 8; offset < png.length; ) {
    const length = png.readUInt32BE(offset);
    if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT') {
      chunks.push(png.subarray(offset + 8, offset + 8 + length));
    }
    offset += length + 12;
  }
  const raw = inflateSync(Buffer.concat(chunks));
  const pixels: number[] = [];
  for (let row = 0; row < 48; row++) {
    const start = row * (64 * 4 + 1);
    expect(raw[start]).toBe(0);
    pixels.push(...raw.subarray(start + 1, start + 1 + 64 * 4));
  }
  const audit = await page.evaluate(() => Reflect.get(window, '__wholeComposite'));
  expect(audit.windows).toBeGreaterThan(0);
  await expect(stage).not.toHaveAttribute('data-render-source', 'layers');
  expect(pixels).toEqual(audit.pixels);
});
