import { expect, test, type Page } from '@playwright/test';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

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
