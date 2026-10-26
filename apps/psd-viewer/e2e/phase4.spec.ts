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
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
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
  await expect(page.getByText(/Geometry overlay requires a typed/)).toBeVisible();
  await page.locator('[data-layer-index="1"]').click();
  await expect(page.getByRole('combobox', { name: 'Mask view', exact: true })).toBeEnabled();
  await page.getByRole('combobox', { name: 'Mask view', exact: true }).selectOption('overlay');
  await expect(page.getByRole('img', { name: 'Saved mask red overlay' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Mask view', exact: true }).selectOption('only');
  await expect(page.getByText(/Saved-record properties and pixels/)).toBeVisible();
});
