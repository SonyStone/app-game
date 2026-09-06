import { test, chromium, devices } from '@playwright/test';

// This test file uses the project's Chromium browser (from playwright config)
// and tests mouse.move with the project settings

test('project browser: page.setContent + mouse.move', async ({ page }) => {
  // This uses the browser from the project config (Desktop Chrome device)
  await page.setContent('<html><body><h1>Test</h1></body></html>');
  console.log('move 1');
  await page.mouse.move(50, 50);
  console.log('move 2');
  await page.mouse.move(100, 100);
  console.log('done');
});

test('standalone browser: identical settings to Desktop Chrome', async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    ...devices['Desktop Chrome'],
  });
  const page = await context.newPage();
  await page.setContent('<html><body><h1>Test</h1></body></html>');
  console.log('move 1');
  await page.mouse.move(50, 50);
  console.log('move 2');
  await page.mouse.move(100, 100);
  console.log('done');
  await browser.close();
});
