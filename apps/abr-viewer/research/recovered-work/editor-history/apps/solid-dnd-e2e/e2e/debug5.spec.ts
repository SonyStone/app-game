import { test, chromium } from '@playwright/test';

// Test with explicit browser launch args
test('mouse.move with extra args', async () => {
  const browser = await chromium.launch({
    args: [
      '--disable-gpu',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
    ]
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.setContent('<html><body><h1>Test</h1></body></html>');

  console.log('move 1');
  await page.mouse.move(50, 50);
  console.log('move 2');
  await page.mouse.move(100, 100);
  console.log('move 3');
  await page.mouse.move(150, 150);
  console.log('all done!');
  await browser.close();
});

test('mouse.move with CDP and ack check', async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.setContent('<html><body><h1>Test</h1></body></html>');

  const cdp = await context.newCDPSession(page);

  console.log('CDP move 1');
  const r1 = await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved', x: 50, y: 50
  });
  console.log('CDP move 1 response:', JSON.stringify(r1));

  console.log('CDP move 2');
  const r2 = await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved', x: 100, y: 100
  });
  console.log('CDP move 2 response:', JSON.stringify(r2));

  console.log('All CDP moves done');
  await browser.close();
});

// Test if the issue is with the default Desktop Chrome device
test('mouse.move with minimal context (no device)', async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 800, height: 600 }
  });
  const page = await context.newPage();
  await page.setContent('<html><body><h1>Test</h1></body></html>');

  console.log('move 1');
  await page.mouse.move(50, 50);
  console.log('move 2');
  await page.mouse.move(100, 100);
  console.log('done!');
  await browser.close();
});
