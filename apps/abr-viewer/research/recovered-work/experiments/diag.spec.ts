import { test, expect } from '@playwright/test';
test('click with force', async ({ page }) => {
  await page.goto('http://localhost:3030');
  await expect(page.locator('[data-block-type="brush"]').first()).toBeVisible();
  // Use force:true to skip Playwright's stability check
  await page.locator('[data-block-type="brush"]').first().click({ force: true });
  await expect(page.locator('text=Selected:')).toContainText('1');
});
test('mouse.move raw', async ({ page }) => {
  await page.goto('http://localhost:3030');
  await expect(page.locator('[data-block-type="brush"]').first()).toBeVisible();
  await page.mouse.move(200, 300);
  await page.mouse.down();
  await page.mouse.move(200, 350);
  await page.mouse.up();
});
