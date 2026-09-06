import { test, chromium } from '@playwright/test';

test('mouse.move: no viewport', async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage(); // no viewport
  await page.setContent('<html><body><h1>Test</h1></body></html>');
  console.log('move 1');
  await page.mouse.move(50, 50);
  console.log('move 2');
  await page.mouse.move(100, 100);
  console.log('done');
  await browser.close();
});

test('mouse.move: with viewport 800x600', async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 800, height: 600 } });
  const page = await context.newPage();
  await page.setContent('<html><body><h1>Test</h1></body></html>');
  console.log('move 1');
  await page.mouse.move(50, 50);
  console.log('move 2');
  await page.mouse.move(100, 100);
  console.log('done');
  await browser.close();
});

test('mouse.move: with viewport null', async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: null });
  const page = await context.newPage();
  await page.setContent('<html><body><h1>Test</h1></body></html>');
  console.log('move 1');
  await page.mouse.move(50, 50);
  console.log('move 2');
  await page.mouse.move(100, 100);
  console.log('done');
  await browser.close();
});

test('mouse.move: Desktop Chrome device', async () => {
  const { devices } = await import('@playwright/test');
  const browser = await chromium.launch();
  const context = await browser.newContext({ ...devices['Desktop Chrome'] });
  const page = await context.newPage();
  await page.setContent('<html><body><h1>Test</h1></body></html>');
  console.log('move 1');
  await page.mouse.move(50, 50);
  console.log('move 2');
  await page.mouse.move(100, 100);
  console.log('done');
  await browser.close();
});

test('mouse.move: viewport 1280x720 only', async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  await page.setContent('<html><body><h1>Test</h1></body></html>');
  console.log('move 1');
  await page.mouse.move(50, 50);
  console.log('move 2');
  await page.mouse.move(100, 100);
  console.log('done');
  await browser.close();
});
