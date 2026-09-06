import { AbrParser } from '@app-game/abr-parser';
import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const samples = new URL('../../../packages/abr-parser/files/', import.meta.url);

test('opens from app-game navigation, inspects brushes, and exports them', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('link', { name: 'ABR Viewer', exact: true }).click();
  await expect(page).toHaveURL(/\/abr-viewer$/);
  await expect(page.getByRole('heading', { name: 'ABR Editor' })).toBeVisible();

  const sample = fileURLToPath(new URL('Basic_3.abr', samples));
  await page.locator('input[type=file]').setInputFiles(sample);
  await expect(page.locator('[data-brush-id]')).toHaveCount(3);
  await page.locator('[data-brush-id]').first().dblclick();
  const detail = page.locator('[data-abr-brush-detail]');
  await expect(detail).toBeVisible();
  await expect(detail.getByRole('textbox', { name: 'Brush name' })).toHaveValue('Soft Round 40');
  await detail.getByRole('spinbutton', { name: 'Size', exact: true }).fill('80');
  await expect(detail.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
  const canvas = detail.locator('canvas');
  await expect.poll(() => canvas.evaluate((element) => element.width)).toBeGreaterThan(0);
  await detail.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(detail).toHaveCount(0);

  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export All', exact: true }).click();
  const download = await downloadEvent;
  const exported = testInfo.outputPath('exported.abr');
  await download.saveAs(exported);
  const parser = new AbrParser();
  const result = parser.parse(await readFile(exported));
  const original = parser.parse(await readFile(sample));
  expect(result.errors).toEqual([]);
  expect(result.brushes.map((brush) => brush.name)).toEqual(original.brushes.map((brush) => brush.name));
  expect(errors).toEqual([]);
});

test('loads sampled tips through file drop and filters the brush list', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/abr-viewer');
  await expect(page.getByRole('heading', { name: 'ABR Editor' })).toBeVisible();
  const name = 'Chunky_Chalk_Brush_by_MarkWinters.abr';
  const bytes = [...(await readFile(new URL(name, samples)))];
  const expected = new AbrParser().parse(new Uint8Array(bytes));
  await page.locator('.abr-viewer main > div').evaluate(
    (element, data) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([new Uint8Array(data.bytes)], data.name));
      element.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: transfer }));
    },
    { name, bytes }
  );
  await expect(page.locator('[data-brush-id]')).toHaveCount(expected.brushes.length);
  await expect(page.locator('[data-brush-id] img').first()).toBeVisible();
  await page.getByPlaceholder('Search brushes and groups...').fill('no-matching-brush');
  await expect(page.locator('[data-brush-id]')).toHaveCount(0);
  await page.getByPlaceholder('Search brushes and groups...').fill('');
  await expect(page.locator('[data-brush-id]')).toHaveCount(expected.brushes.length);
  expect(errors).toEqual([]);
});
