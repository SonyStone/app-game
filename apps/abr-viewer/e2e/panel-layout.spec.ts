import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const samples = new URL('../../../packages/abr-parser/files/', import.meta.url);

for (const viewport of [
  { width: 1300, height: 600 },
  { width: 900, height: 700 }
]) {
  test(`settings, stroke preview and both dividers fit a ${viewport.width}×${viewport.height} screen`, async ({
    page
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/abr-viewer');
    await page.locator('input[type=file]').setInputFiles(fileURLToPath(new URL('CGCookie_BasicBrushes.abr', samples)));
    await page.locator('[data-brush-id]').nth(1).click();
    const detail = page.locator('[data-abr-brush-detail]');
    const preview = detail.locator('[class*=strokePreview]');
    const settings = detail.locator('[class*=settingsBody]');

    await expect
      .poll(async () => (await preview.boundingBox())!.y + (await preview.boundingBox())!.height)
      .toBeLessThanOrEqual(viewport.height);
    expect((await settings.boundingBox())!.height).toBeGreaterThanOrEqual(150);

    expect(await dragSeparator(page, 'Panel width', 100, 0)).toEqual({ x: 100, y: 0 });
    // Growing the preview stops where the settings list would get too short.
    await dragSeparator(page, 'Stroke preview height', 0, -400);
    expect((await settings.boundingBox())!.height).toBeGreaterThanOrEqual(150);
    const resizer = page.getByRole('separator', { name: 'Stroke preview height' });
    const tallest = Number(await resizer.getAttribute('aria-valuenow'));
    await dragSeparator(page, 'Stroke preview height', 0, 30);
    await expect(resizer).toHaveAttribute('aria-valuenow', String(Math.max(120, tallest - 30)));
  });
}

/** Drags a separator with the mouse and returns how far it actually moved, rounded to pixels. */
async function dragSeparator(page: Page, name: string, dx: number, dy: number) {
  const separator = page.getByRole('separator', { name });
  const before = (await separator.boundingBox())!;
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 + dx, before.y + before.height / 2 + dy, { steps: 5 });
  await page.mouse.up();
  const after = (await separator.boundingBox())!;
  return { x: Math.round(after.x - before.x), y: Math.round(after.y - before.y) };
}

test('the editor fits inside the Paint dialog instead of the whole viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 700 });
  await page.goto('/paint/studio');
  await page
    .getByRole('button', { name: /ABR Brush/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Brush settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'ABR brush editor' });
  const status = dialog.getByRole('status');
  await expect(status).toBeVisible();

  const dialogBox = (await dialog.boundingBox())!;
  const statusBox = (await status.boundingBox())!;
  expect(statusBox.y + statusBox.height).toBeLessThanOrEqual(dialogBox.y + dialogBox.height);
});
