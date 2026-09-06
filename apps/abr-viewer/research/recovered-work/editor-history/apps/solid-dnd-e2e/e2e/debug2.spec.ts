import { expect, test } from '@playwright/test';

test('debug: check for global pointermove listeners', async ({ page }) => {
  // Listen to console messages
  page.on('console', msg => console.log('PAGE:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  await page.goto('/#drag');
  await expect(page.locator('[data-fixture="drag"]')).toBeVisible();

  // Check for global event listeners
  const listeners = await page.evaluate(() => {
    // Check if there are any global pointermove/mousemove listeners
    // We can't directly enumerate listeners, but we can check some things
    const results: string[] = [];

    // Check if getEventListeners is available (Chrome DevTools only)
    try {
      // @ts-ignore - Chrome DevTools API
      if (typeof getEventListeners === 'function') {
        // @ts-ignore
        const docListeners = getEventListeners(document);
        // @ts-ignore
        const winListeners = getEventListeners(window);
        results.push('document listeners: ' + JSON.stringify(Object.keys(docListeners)));
        results.push('window listeners: ' + JSON.stringify(Object.keys(winListeners)));
      }
    } catch (e) {
      results.push('getEventListeners not available');
    }

    return results;
  });
  console.log('Listeners:', listeners);

  // Try adding our own pointermove listener to see if events actually fire
  await page.evaluate(() => {
    (window as any).__moveCount = 0;
    (window as any).__lastMoveTime = 0;
    document.addEventListener('pointermove', (e) => {
      (window as any).__moveCount++;
      (window as any).__lastMoveTime = Date.now();
      console.log(`pointermove #${(window as any).__moveCount} at ${e.clientX},${e.clientY}`);
    });
  });

  console.log('Trying first mouse.move...');
  await page.mouse.move(100, 100);
  console.log('First mouse.move done');

  const count1 = await page.evaluate(() => (window as any).__moveCount);
  console.log('Move count after first move:', count1);

  console.log('Trying second mouse.move...');
  await page.mouse.move(150, 150);
  console.log('Second mouse.move done');

  const count2 = await page.evaluate(() => (window as any).__moveCount);
  console.log('Move count after second move:', count2);
});

test('debug: empty page mouse.move', async ({ page }) => {
  // Test on a completely empty page (no SolidJS app)
  await page.setContent('<html><body><h1>Empty page</h1></body></html>');

  console.log('Move 1');
  await page.mouse.move(50, 50);
  console.log('Move 2');
  await page.mouse.move(100, 100);
  console.log('Move 3');
  await page.mouse.move(150, 150);
  console.log('All moves done');
});

test('debug: app page with evaluate between moves', async ({ page }) => {
  await page.goto('/#drag');
  await expect(page.locator('[data-fixture="drag"]')).toBeVisible();

  console.log('Move 1');
  await page.mouse.move(100, 100);
  console.log('Move 1 done, checking page...');

  // Is the page responsive after first move?
  const alive = await page.evaluate(() => 'alive');
  console.log('Page is', alive);

  console.log('Move 2...');
  await page.mouse.move(150, 150);
  console.log('Move 2 done');
});
