import { test, expect } from '@playwright/test';

test('click with force:true works', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-block-type="brush"]').first()).toBeVisible();
  await page.locator('[data-block-type="brush"]').first().click({ force: true });
  await expect(page.locator('text=Selected:')).toContainText('1');
});

test('dispatchEvent drag works', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-block-type="brush"]').first()).toBeVisible();
  const brush = page.locator('[data-block-type="brush"]').first();
  const box = await brush.boundingBox();

  await brush.dispatchEvent('pointerdown', {
    clientX: box!.x + 5, clientY: box!.y + 5, button: 0, pointerId: 1, isPrimary: true
  });
  await page.waitForTimeout(50);
  // Move past drag threshold
  for (let i = 1; i <= 5; i++) {
    await page.evaluate(({ x, y }) => {
      document.dispatchEvent(new PointerEvent('pointermove', {
        clientX: x, clientY: y, bubbles: true
      }));
    }, { x: box!.x + 5, y: box!.y + 5 + i * 20 });
    await page.waitForTimeout(20);
  }
  // Drop
  await page.evaluate(({ x, y }) => {
    document.dispatchEvent(new PointerEvent('pointerup', {
      clientX: x, clientY: y, bubbles: true
    }));
  }, { x: box!.x + 5, y: box!.y + 105 });
});

test('mouse.move with steps param', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-block-type="brush"]').first()).toBeVisible();
  // Try using the steps param (sends intermediate moves internally)
  await page.mouse.move(200, 300, { steps: 1 });
  await page.mouse.move(200, 350, { steps: 1 });
});

