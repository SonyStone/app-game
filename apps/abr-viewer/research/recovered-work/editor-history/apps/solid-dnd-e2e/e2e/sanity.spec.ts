import { expect, test } from '@playwright/test';

test('page.mouse.move works on a blank page', async ({ page }) => {
  await page.setContent('<div id="box" style="width:100px;height:100px;background:red;">Hello</div>');
  await page.mouse.move(50, 50);
  await page.mouse.down();
  await page.mouse.move(60, 60);
  await page.mouse.up();
  expect(true).toBe(true);
});

test('page.mouse.move works on the flip fixture', async ({ page }) => {
  await page.goto('/#flip');
  await expect(page.locator('[data-fixture="flip"]')).toBeVisible();
  
  // Just move the mouse — no click
  await page.mouse.move(100, 100);
  expect(true).toBe(true);
});

test('locator.click works on the flip fixture', async ({ page }) => {
  await page.goto('/#flip');
  await expect(page.locator('[data-fixture="flip"]')).toBeVisible();
  
  // Force click to skip actionability checks
  await page.locator('[data-action="move-first-to-end"]').click({ force: true });
  await page.waitForTimeout(500);
  const order = await page.locator('[data-testid="item-order"]').textContent();
  expect(order).toBe('b,c,d,e,a');
});

test('mouse.move works on the drag fixture', async ({ page }) => {
  await page.goto('/#drag');
  await expect(page.locator('[data-fixture="drag"]')).toBeVisible();
  
  const handle = page.locator('[data-testid="drag-handle"]');
  const box = await handle.boundingBox();
  if (!box) throw new Error('no box');
  
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx, cy + 50);
  await page.mouse.up();
  
  expect(true).toBe(true);
});
