import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { openPsd, photoshopDefaultSettings } from '../../../packages/psd/src/viewer';
import { grayRamp } from '../tests/grayFixtures';

for (const [mode, embedded] of [
  [4, false],
  [4, true],
  [9, false]
] as const) {
  test(`mode ${mode}, embedded ${embedded} shows converted pixels and a color notice`, async ({ page }) => {
    const channels = mode === 4 ? [255, 100, 0, 255] : [128, 180, 100];
    const profile = embedded
      ? new Uint8Array(await readFile(new URL('../../../packages/psd/test/cmyk.icc', import.meta.url)))
      : undefined;
    const resourceLength = profile ? 12 + profile.length + (profile.length % 2) : 0;
    const bytes = new Uint8Array(40 + resourceLength + channels.length);
    bytes.set([56, 66, 80, 83]);
    const view = new DataView(bytes.buffer);
    view.setUint16(4, 1);
    view.setUint16(12, channels.length);
    view.setUint32(14, 1);
    view.setUint32(18, 1);
    view.setUint16(22, 8);
    view.setUint16(24, mode);
    if (profile) {
      view.setUint32(30, resourceLength);
      bytes.set(new TextEncoder().encode('8BIM'), 34);
      view.setUint16(38, 1039);
      view.setUint32(42, profile.length);
      bytes.set(profile, 46);
    }
    bytes.set(channels, 40 + resourceLength);
    await page.addInitScript(() => {
      const Original = window.Worker;
      window.Worker = class extends Original {
        constructor(url: string | URL, options?: WorkerOptions) {
          super(url, options);
          this.addEventListener('message', (event) => {
            const reply = event.data;
            const image =
              reply.type === 'rendered' ? reply.render : reply.type === 'windowRendered' ? reply.images[0] : undefined;
            if (image?.pixels?.length) {
              (window as unknown as { convertedPixel: number[] }).convertedPixel = Array.from(image.pixels.slice(0, 4));
            }
          });
        }
      };
    });
    await page.goto('/?backend=canvas2d');
    await page
      .locator('input[accept=".psd,.psb"]')
      .setInputFiles({ name: `mode-${mode}.psd`, mimeType: 'image/vnd.adobe.photoshop', buffer: Buffer.from(bytes) });
    await expect(page.locator('[data-busy]')).toHaveAttribute('data-render-id', /\d+/);
    await expect(page.locator('[data-busy]')).toHaveAttribute('data-busy', 'false');
    await expect(page.getByRole('img', { name: 'Our render' })).toBeVisible();
    await page.getByLabel('Document diagnostics', { exact: true }).locator('summary').first().click();
    if (mode === 4 && !embedded) {
      await expect(page.getByLabel('Renderer status')).toContainText(
        'This CMYK file has no color profile. Colors are approximate. Choose a CMYK profile in Display settings for accurate colors.'
      );
      const legacy = await page.evaluate(() => (window as unknown as { convertedPixel: number[] }).convertedPixel);
      await page
        .getByLabel('Working CMYK profile', { exact: true })
        .setInputFiles(fileURLToPath(new URL('../../../packages/psd/test/cmyk.icc', import.meta.url)));
      await expect(page.getByText('cmyk.icc · Stored only on this device')).toBeVisible();
      await expect(page.getByLabel('Renderer status')).toContainText('Converted to sRGB for display');
      expect(await page.evaluate(() => (window as unknown as { convertedPixel: number[] }).convertedPixel)).not.toEqual(
        legacy
      );
      await page.screenshot({ path: '/tmp/psd-working-cmyk-profile.png' });
      await page
        .getByLabel('Working CMYK profile', { exact: true })
        .setInputFiles(fileURLToPath(new URL('../src/features/render-settings/profiles/srgb.icc', import.meta.url)));
      await expect(page.getByRole('alert')).toContainText('Choose a valid CMYK ICC profile.');
      await expect(page.getByText('cmyk.icc · Stored only on this device')).toBeVisible();
    } else {
      await expect(page.getByLabel('Renderer status')).toContainText('Converted to sRGB for display');
    }
    const opened = await openPsd(bytes);
    if (!opened.ok) {
      throw new Error(opened.error.message);
    }
    try {
      const profiles = new URL('../src/features/render-settings/profiles/', import.meta.url);
      const srgb = new Uint8Array(await readFile(new URL('srgb.icc', profiles)));
      const workingCmyk = new Uint8Array(
        await readFile(new URL('../../../packages/psd/test/cmyk.icc', import.meta.url))
      );
      const expected = opened.value.renderSrgb(
        { ...photoshopDefaultSettings, approximate: true, approximateOneSidedStrokes: true },
        { srgb, workingCmyk, dither: false }
      );
      if (!expected.ok) {
        throw new Error(expected.error.message);
      }
      expect(await page.evaluate(() => (window as unknown as { convertedPixel: number[] }).convertedPixel)).toEqual([
        ...expected.value.rgba8
      ]);
    } finally {
      opened.value.close();
    }
    if (mode === 4 && !embedded) {
      await page.reload();
      await expect(page.getByText('cmyk.icc · Stored only on this device')).toBeVisible();
      await page
        .locator('input[accept=".psd,.psb"]')
        .setInputFiles({ name: 'untagged.psd', mimeType: 'image/vnd.adobe.photoshop', buffer: Buffer.from(bytes) });
      await page.getByLabel('Document diagnostics', { exact: true }).locator('summary').first().click();
      await expect(page.getByLabel('Renderer status')).toContainText('Converted to sRGB for display');
      await page.getByRole('button', { name: 'Clear CMYK profile' }).click();
      await expect(page.getByLabel('Renderer status')).toContainText('This CMYK file has no color profile.');
      await page.screenshot({ path: '/tmp/psd-working-cmyk-approximate.png' });
    }
    await page.screenshot({ path: `/tmp/psd-batch20-mode-${mode}.png` });
  });
}

for (const depth of [8, 16] as const) {
  test(`generated Gray${depth} working profile converts in Chrome`, async ({ page }) => {
    const bytes = [...grayRamp(depth)];
    await page.goto('/?backend=canvas2d');
    const result = await page.evaluate(
      async ({ bytes, viewerPath }) => {
        const colorModule = '/src/features/render-settings/displayColor.ts';
        const { displayColor } = await import(colorModule);
        const { openPsd, photoshopDefaultSettings } = await import(viewerPath);
        const opened = await openPsd(new Uint8Array(bytes));
        if (!opened.ok) {
          throw new Error(opened.error.message);
        }
        try {
          const render = opened.value.renderSrgb(photoshopDefaultSettings, await displayColor());
          if (!render.ok) {
            throw new Error(render.error.message);
          }
          return {
            pixels: render.value.rgba8.length / 4,
            first: [...render.value.rgba8.slice(0, 4)],
            last: [...render.value.rgba8.slice(-4)]
          };
        } finally {
          opened.value.close();
        }
      },
      { bytes, viewerPath: `/@fs${fileURLToPath(new URL('../../../packages/psd/src/viewer.ts', import.meta.url))}` }
    );
    expect(result).toEqual({ pixels: depth === 8 ? 256 : 65536, first: [0, 0, 0, 255], last: [255, 255, 255, 255] });
  });
}
