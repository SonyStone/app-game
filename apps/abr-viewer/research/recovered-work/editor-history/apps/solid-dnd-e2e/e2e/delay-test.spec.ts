import { expect, test } from '@playwright/test';

test('three moves with delays between them', async ({ page }) => {
  await page.setContent('<div style="width:200px;height:200px;background:red;">box</div>');
  await page.mouse.move(50, 50);
  await new Promise(r => setTimeout(r, 50));
  await page.mouse.move(60, 60);
  await new Promise(r => setTimeout(r, 50));
  await page.mouse.move(70, 70);
  expect(true).toBe(true);
});

test('five moves with delays', async ({ page }) => {
  await page.setContent('<div style="width:200px;height:200px;background:red;">box</div>');
  for (let i = 0; i < 5; i++) {
    await page.mouse.move(50 + i * 10, 50 + i * 10);
    await new Promise(r => setTimeout(r, 50));
  }
  expect(true).toBe(true);
});

test('drag with individual moves and delays', async ({ page }) => {
  await page.setContent('<div style="width:200px;height:200px;background:red;">box</div>');
  await page.mouse.move(50, 50);
  await new Promise(r => setTimeout(r, 50));
  await page.mouse.down();
  await new Promise(r => setTimeout(r, 50));
  for (let i = 1; i <= 5; i++) {
    await page.mouse.move(50, 50 + i * 10);
    await new Promise(r => setTimeout(r, 50));
  }
  await page.mouse.up();
  expect(true).toBe(true);
});

test('three moves NO delay', async ({ page }) => {
  await page.setContent('<div style="width:200px;height:200px;background:red;">box</div>');
  await page.mouse.move(50, 50);
  await page.mouse.move(60, 60);
  await page.mouse.move(70, 70);
  expect(true).toBe(true);
});

test('page.evaluate requestAnimationFrame between moves', async ({ page }) => {
  await page.setContent('<div style="width:200px;height:200px;background:red;">box</div>');
  await page.mouse.move(50, 50);
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => r(undefined))));
  await page.mouse.move(60, 60);
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => r(undefined))));
  await page.mouse.move(70, 70);
  expect(true).toBe(true);
});
