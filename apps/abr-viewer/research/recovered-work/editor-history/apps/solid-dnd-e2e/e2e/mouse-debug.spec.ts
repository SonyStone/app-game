import { expect, test } from '@playwright/test';

test('mouse.move without prior down', async ({ page }) => {
  await page.setContent('<div style="width:200px;height:200px;background:red;">box</div>');
  await page.mouse.move(50, 50);
  await page.mouse.move(60, 60);
  await page.mouse.move(70, 70);
  expect(true).toBe(true);
});

test('mouse.down then up (no move between)', async ({ page }) => {
  await page.setContent('<div style="width:200px;height:200px;background:red;">box</div>');
  await page.mouse.move(50, 50);
  await page.mouse.down();
  await page.mouse.up();
  expect(true).toBe(true);
});

test('mouse.click (combined)', async ({ page }) => {
  await page.setContent('<div style="width:200px;height:200px;background:red;">box</div>');
  await page.mouse.click(50, 50);
  expect(true).toBe(true);
});

test('mouse.down then move then up', async ({ page }) => {
  await page.setContent('<div style="width:200px;height:200px;background:red;">box</div>');
  await page.mouse.move(50, 50);
  await page.mouse.down();
  await page.mouse.move(100, 100);
  await page.mouse.up();
  expect(true).toBe(true);
});

test('mouse.down then move with steps', async ({ page }) => {
  await page.setContent('<div style="width:200px;height:200px;background:red;">box</div>');
  await page.mouse.move(50, 50);
  await page.mouse.down();
  await page.mouse.move(100, 100, { steps: 5 });
  await page.mouse.up();
  expect(true).toBe(true);
});
