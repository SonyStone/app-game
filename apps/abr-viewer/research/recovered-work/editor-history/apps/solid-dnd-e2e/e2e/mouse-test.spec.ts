import { expect, test } from '@playwright/test';

test('page.mouse drag works on drag handle', async ({ page }) => {
  await page.goto('/#drag');
  await expect(page.locator('[data-fixture="drag"]')).toBeVisible();

  const handle = page.locator('[data-testid="drag-handle"]');
  const box = await handle.boundingBox();
  if (!box) throw new Error('no box');

  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  // Use real page.mouse — CDP-driven
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.waitForTimeout(50);

  // Move 30px down in steps (past 8px threshold)
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(cx, cy + i * 5);
    await page.waitForTimeout(20);
  }

  const dragging = await page.locator('[data-testid="is-dragging"]').textContent();
  console.log('isDragging:', dragging);

  const event = await page.locator('[data-testid="last-event"]').textContent();
  console.log('lastEvent:', event);

  await page.mouse.up();
  await page.waitForTimeout(50);

  const finalEvent = await page.locator('[data-testid="last-event"]').textContent();
  console.log('finalEvent:', finalEvent);

  expect(dragging).toBe('true');
});
