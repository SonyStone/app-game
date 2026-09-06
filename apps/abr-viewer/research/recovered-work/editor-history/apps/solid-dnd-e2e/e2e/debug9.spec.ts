import { test, expect } from '@playwright/test';

// Workaround 1: page.evaluate noop between moves
test('workaround: evaluate between moves', async ({ page }) => {
  await page.setContent('<html><body><h1>Test</h1></body></html>');
  for (let i = 0; i < 5; i++) {
    await page.mouse.move(50 + i * 10, 50 + i * 10);
    // Force a CDP round-trip between moves
    await page.evaluate(() => {});
  }
  console.log('done');
});

// Workaround 2: waitForTimeout(0) between moves
test('workaround: waitForTimeout(0) between moves', async ({ page }) => {
  await page.setContent('<html><body><h1>Test</h1></body></html>');
  for (let i = 0; i < 5; i++) {
    await page.mouse.move(50 + i * 10, 50 + i * 10);
    await page.waitForTimeout(0);
  }
  console.log('done');
});

// Workaround 3: mouse.wheel(0,0) between moves
test('workaround: wheel between moves', async ({ page }) => {
  await page.setContent('<html><body><h1>Test</h1></body></html>');
  for (let i = 0; i < 5; i++) {
    await page.mouse.move(50 + i * 10, 50 + i * 10);
    await page.mouse.wheel(0, 0);
  }
  console.log('done');
});

// Workaround 4: page.evaluate to dispatch pointermove
test('workaround: evaluate dispatches pointermove directly', async ({ page }) => {
  await page.setContent('<html><body><div id="target" style="width:200px;height:200px;background:blue"></div></body></html>');

  // Add a pointermove counter
  await page.evaluate(() => {
    (window as any).__moveCount = 0;
    document.addEventListener('pointermove', () => (window as any).__moveCount++);
  });

  // Initial move + mousedown (simulates pointerDown)
  await page.mouse.move(100, 100);
  await page.mouse.down();

  // Dispatch pointermove events via evaluate (bypasses CDP mouse.move)
  for (let i = 1; i <= 10; i++) {
    await page.evaluate(({ x, y }) => {
      const target = document.elementFromPoint(x, y) || document;
      target.dispatchEvent(new PointerEvent('pointermove', {
        clientX: x, clientY: y,
        bubbles: true, cancelable: true,
        isPrimary: true, pointerId: 1,
        pointerType: 'mouse',
        button: -1, buttons: 1,
      }));
    }, { x: 100, y: 100 + i * 5 });
  }

  const count = await page.evaluate(() => (window as any).__moveCount);
  console.log('pointermove count:', count);

  await page.mouse.up();
  console.log('done');
});

// Workaround 5: Use CDP directly for mouseMoved events
test('workaround: direct CDP for mouseMoved', async ({ page, context }) => {
  await page.setContent('<html><body><h1>Test</h1></body></html>');

  const cdp = await context.newCDPSession(page);

  for (let i = 0; i < 5; i++) {
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: 50 + i * 10,
      y: 50 + i * 10,
    });
  }
  console.log('done');
});

// Workaround 6: Combine steps:0 for most moves, use mouse.move only once
test('workaround: steps:0 + single mouse.move', async ({ page }) => {
  await page.setContent('<html><body><h1>Test</h1></body></html>');

  // Move without CDP events
  await page.mouse.move(50, 50, { steps: 0 });
  await page.mouse.move(100, 100, { steps: 0 });
  await page.mouse.move(150, 150, { steps: 0 });
  await page.mouse.move(200, 200, { steps: 0 });
  // One real move at the end
  await page.mouse.move(250, 250);
  console.log('done');
});
