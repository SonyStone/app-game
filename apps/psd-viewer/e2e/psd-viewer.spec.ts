import { expect, test, type Page } from '@playwright/test';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { truncated, withChannelCompression } from '../tests/damagedPsd';
import { withTopBlendKey } from '../tests/patchedPsd';

const assets = new URL('../src/features/examples/assets/', import.meta.url);

/** The viewport, whose data attributes report the view, busy state and current render. */
const stage = (page: Page) => page.locator('[data-busy]');

async function settled(page: Page) {
  await expect(stage(page)).toHaveAttribute('data-busy', 'false');
}

test('renders an example, re-renders on a layer toggle, and reports an exact difference', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Examples…' }).click();
  await page.getByRole('button', { name: /Adjustment stack/ }).click();
  await expect(stage(page)).toHaveAttribute('data-render-id', /\d+/);
  await settled(page);
  await expect(page.getByRole('img', { name: 'Our render' })).toBeVisible();
  await expect(page.getByRole('tree', { name: 'Layers' }).getByRole('treeitem')).toHaveCount(5);
  await expect(page.locator('footer[role=status]')).toContainText('Rendered 96 × 96 at 8 bits');

  const first = await stage(page).getAttribute('data-render-id');
  await page.getByRole('checkbox', { name: 'Visible: posterize' }).uncheck();
  await expect(stage(page)).not.toHaveAttribute('data-render-id', first!);
  await settled(page);

  await page.getByRole('button', { name: 'Difference', exact: true }).click();
  const statistics = page.getByRole('region', { name: 'Difference statistics' });
  await expect(statistics).toBeVisible();
  expect(Number(await statistics.getAttribute('data-mismatches'))).toBeGreaterThan(0);
  await expect(page.getByRole('img', { name: 'Difference heat map' })).toBeVisible();

  await page.getByRole('checkbox', { name: 'Visible: posterize' }).check();
  await expect(statistics).toHaveAttribute('data-mismatches', '0');
  await expect(statistics).toContainText('Exact: 0 of 27,648 samples differ');

  await page.getByRole('button', { name: 'Photoshop', exact: true }).click();
  await expect(page.getByRole('img', { name: "Photoshop's merged image" })).toBeVisible();
  expect(errors).toEqual([]);
});

test('opens a file from the picker and inspects a type layer', async ({ page }) => {
  await page.goto('/');
  await page
    .locator('input[accept=".psd,.psb"]')
    .setInputFiles(fileURLToPath(new URL('type-with-layer-styles.psd', assets)));
  await settled(page);
  await expect(stage(page)).toHaveAttribute('data-render-id', /\d+/);
  await page.locator('[data-layer-index="1"]').click();
  const detail = page.locator('[data-layer-detail="1"]');
  await expect(detail).toContainText('STYLED');
  await expect(detail).toContainText('Bevel & Emboss');
  await expect(detail.getByRole('img', { name: 'Layer pixels' })).toBeVisible();
  await page.getByRole('button', { name: 'Document', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Image resources' })).toContainText('ICC');
});

test('detects gamma 1.0 blending from the merged image of an opened file', async ({ page }) => {
  await page.goto('/');
  const gamma = page.getByRole('checkbox', { name: 'Blend RGB colors using gamma 1.0' });
  await expect(gamma).not.toBeChecked();
  // Captured with gamma 1.0 blending; opened from the picker, without the example's settings.
  await page
    .locator('input[accept=".psd,.psb"]')
    .setInputFiles(fileURLToPath(new URL('pass-through-groups.psd', assets)));
  await settled(page);
  await expect(gamma).toBeChecked();
  const settings = page.getByRole('region', { name: 'Render settings' });
  await expect(settings).toContainText("Detected from Photoshop's merged image");
  await page.getByRole('button', { name: 'Difference', exact: true }).click();
  const statistics = page.getByRole('region', { name: 'Difference statistics' });
  await expect(statistics).toHaveAttribute('data-mismatches', '0');

  // A choice overrides the detection for this document.
  await gamma.uncheck();
  await expect(settings).not.toContainText('Detected');
  await expect(statistics).not.toHaveAttribute('data-mismatches', '0');
});

test('a dropped CMYK document composites exactly in its CMYK channels', async ({ page }) => {
  await page.goto('/');
  const bytes = [...(await readFile(new URL('cmyk-levels.psd', assets)))];
  await stage(page).evaluate((element, data) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array(data)], 'cmyk-levels.psd'));
    element.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: transfer }));
  }, bytes);
  await settled(page);
  const status = page.getByRole('region', { name: 'Renderer status' });
  await expect(status).toHaveAttribute('data-render-state', 'approximate');
  await expect(status.getByRole('list', { name: 'Approximations' })).toContainText(
    '8-bit CMYK: composited exactly in its CMYK channels'
  );
  await expect(page.getByRole('img', { name: 'Our render' })).toBeVisible();

  await page.getByRole('button', { name: 'Difference', exact: true }).click();
  const statistics = page.getByRole('region', { name: 'Difference statistics' });
  await expect(statistics).toHaveAttribute('data-mismatches', '0');
  await expect(statistics).toContainText('Exact: 0 of 36,864 samples differ');
  await expect(statistics).toContainText("Compared in the document's CMYK channels");
});

test('shows a document the exact path refuses approximated, saying what it approximates', async ({ page }) => {
  await page.goto('/');
  // Photoshop offers blend modes on adjustment layers; the CMYK channel compositor does not reproduce them.
  const bytes = [
    ...new Uint8Array(withTopBlendKey(toArrayBuffer(await readFile(new URL('cmyk-levels.psd', assets))), 'mul '))
  ];
  await stage(page).evaluate((element, data) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array(data)], 'cmyk-multiply-levels.psd'));
    element.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: transfer }));
  }, bytes);
  await settled(page);
  const status = page.getByRole('region', { name: 'Renderer status' });
  await expect(status).toHaveAttribute('data-render-state', 'approximate');
  await expect(status).toContainText('Not exactly as in Photoshop');
  await expect(status.getByRole('list', { name: 'Approximations' })).toContainText(
    '8-bit CMYK: layers converted to 8-bit sRGB'
  );
  await expect(page.getByRole('img', { name: 'Our render' })).toBeVisible();

  // Exact rendering only: the renderer names what it refuses.
  await page.getByRole('checkbox', { name: 'Approximate unsupported settings' }).uncheck();
  await settled(page);
  await expect(status).toHaveAttribute('data-render-state', 'failed');
  await expect(status).toContainText('adjustment layers with a blend mode, Fill or effects in 8-bit CMYK');
});

test('renders a saved layer comp picked under Saved states', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Examples…' }).click();
  await page.getByRole('button', { name: /Layer comps/ }).click();
  await settled(page);
  const states = page.getByRole('region', { name: 'Saved states' });
  await expect(states.getByRole('option')).toHaveText(['The document as saved', /first/, /second/, /third/]);

  const saved = await stage(page).getAttribute('data-render-id');
  // The second comp, after the document as saved and the first comp.
  await states.getByRole('combobox').selectOption({ index: 2 });
  await expect(stage(page)).not.toHaveAttribute('data-render-id', saved!);
  await settled(page);
  await expect(states).toContainText("Photoshop's merged image shows the document as saved");
  await expect(page.getByRole('region', { name: 'Renderer status' })).toHaveAttribute('data-render-state', 'exact');
  expect(errors).toEqual([]);
});

/** The bytes of a Node buffer as an `ArrayBuffer` of their own. */
function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

/** The system's Arial Bold, the font of the type example; never copied into the repository. */
const arialBold = '/System/Library/Fonts/Supplemental/Arial Bold.ttf';

test('re-renders text with a font file the user adds and matches the merged image', async ({ page }) => {
  test.skip(!existsSync(arialBold), 'needs the system Arial Bold');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page
    .locator('input[accept=".psd,.psb"]')
    .setInputFiles(fileURLToPath(new URL('type-with-layer-styles.psd', assets)));
  await settled(page);
  const fonts = page.getByRole('region', { name: 'Fonts' });
  await expect(fonts.getByRole('list', { name: 'Document fonts' })).toContainText('Arial-BoldMT');
  await expect(fonts.locator('[data-font-status="missing"]')).toHaveCount(1);
  const toggle = fonts.getByRole('checkbox', { name: 'Re-render text' });
  await expect(toggle).toBeDisabled();

  await page.locator('[data-layer-index="1"]').click();
  const support = page.getByRole('region', { name: 'Text re-rendering' });
  await expect(support).toHaveAttribute('data-text-support', 'refused');
  await expect(support).toContainText('font Arial-BoldMT was not supplied');

  await fonts.locator('input[type=file]').setInputFiles(arialBold);
  await expect(fonts.locator('[data-font-status="available"]')).toHaveCount(1);
  await expect(support).toHaveAttribute('data-text-support', 'supported');
  await expect(toggle).toBeEnabled();

  const cached = await stage(page).getAttribute('data-render-id');
  await toggle.check();
  await expect(stage(page)).not.toHaveAttribute('data-render-id', cached!);
  await settled(page);
  await expect(page.getByRole('region', { name: 'Renderer status' })).toHaveAttribute('data-render-state', 'exact');

  await page.getByRole('button', { name: 'Difference', exact: true }).click();
  const statistics = page.getByRole('region', { name: 'Difference statistics' });
  await expect(statistics).toHaveAttribute('data-mismatches', '0');
  expect(errors).toEqual([]);
});

/** Opens `bytes` through the file picker as `name`. */
async function pick(page: Page, name: string, bytes: ArrayBuffer) {
  await page
    .locator('input[accept=".psd,.psb"]')
    .setInputFiles({ name, mimeType: 'image/vnd.adobe.photoshop', buffer: Buffer.from(bytes) });
}

/** The example `name`'s bytes. */
async function example(name: string): Promise<ArrayBuffer> {
  const bytes = await readFile(new URL(name, assets));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

test('opens damaged files as Photoshop does, asking its prompt first', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  const report = page.getByRole('region', { name: 'Opened like Photoshop' });
  const gamma = page.getByRole('checkbox', { name: 'Blend RGB colors using gamma 1.0' });

  // A file Photoshop opens as the strict reader reads it opens without a report.
  await pick(page, 'pass-through-groups.psd', await example('pass-through-groups.psd'));
  await settled(page);
  await expect(page.getByRole('img', { name: 'Our render' })).toBeVisible();
  await expect(report).toHaveCount(0);

  // "probe top"'s red channel gets compression code 4, which no format defines.
  const corrupt = withChannelCompression(await example('pass-through-groups.psd'), 4, 1);
  const prompt = page.getByRole('alertdialog');
  const message = 'This file contains one or more layers which appear to be corrupt. Continue reading layers?';
  await pick(page, 'corrupt.psd', corrupt);
  await expect(prompt).toBeVisible();
  await expect(prompt).toContainText(message);
  await expect(prompt.getByRole('button')).toHaveText(['OK', 'Flatten', 'Cancel']);
  await expect(prompt.getByRole('button', { name: 'OK' })).toBeFocused();

  await prompt.getByRole('button', { name: 'OK' }).click();
  await expect(prompt).toHaveCount(0);
  await settled(page);
  await expect(page.getByRole('img', { name: 'Our render' })).toBeVisible();
  await expect(report.getByRole('list', { name: 'Photoshop alerts' })).toContainText(`${message} Answered OK.`);
  await expect(report.getByRole('list', { name: 'Repairs' })).toContainText(
    'Channels read as Photoshop decodes them in "probe top"'
  );
  // Gamma detection runs on the recovered document as on any other.
  await expect(gamma).toBeChecked();
  await expect(page.getByRole('tree', { name: 'Layers' })).toContainText('probe top');

  await pick(page, 'corrupt.psd', corrupt);
  await prompt.getByRole('button', { name: 'Flatten' }).click();
  await expect(prompt).toHaveCount(0);
  await settled(page);
  await expect(report.getByRole('list', { name: 'Repairs' })).toContainText(
    'The stored composite opened as the Background instead of the layers'
  );
  await page.getByRole('button', { name: 'Difference', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Difference statistics' })).toHaveAttribute('data-mismatches', '0');
  await page.getByRole('button', { name: 'Our render', exact: true }).click();

  await pick(page, 'corrupt.psd', corrupt);
  await prompt.getByRole('button', { name: 'Cancel' }).click();
  await expect(prompt).toHaveCount(0);
  const refusal = page.locator('[data-failure="refused"]');
  await expect(refusal).toContainText('corrupt.psd: Photoshop 26 does not open this file');
  await expect(refusal).toContainText('and Cancel opens nothing');
  await expect(page.getByRole('img', { name: 'Our render' })).toHaveCount(0);

  // Escape answers Cancel.
  await pick(page, 'corrupt.psd', corrupt);
  await expect(prompt).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(prompt).toHaveCount(0);
  await expect(refusal).toContainText('and Cancel opens nothing');

  // A file cut inside its layer section: neither Photoshop nor the strict reader opens it.
  await pick(page, 'cut.psd', truncated(await example('pass-through-groups.psd'), 20_000));
  await expect(refusal).toContainText('cut.psd: Photoshop 26 does not open this file');
  await expect(refusal).toContainText('extends past its container');
  await expect(prompt).toHaveCount(0);
  expect(errors).toEqual([]);
});
