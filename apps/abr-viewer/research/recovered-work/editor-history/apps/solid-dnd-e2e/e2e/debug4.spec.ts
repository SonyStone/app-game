import { test } from '@playwright/test';

// Test with different Chromium flags
test('mouse.move with --disable-gpu', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.setContent('<html><body><h1>Test</h1></body></html>');

  console.log('move 1');
  await page.mouse.move(50, 50);
  console.log('move 2');
  await page.mouse.move(100, 100);
  console.log('done');
  await context.close();
});
