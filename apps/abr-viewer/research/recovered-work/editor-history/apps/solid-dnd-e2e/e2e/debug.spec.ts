import { expect, test } from '@playwright/test';

test('debug: mouse.move after pointerdown on drag handle', async ({ page }) => {
  await page.goto('/#drag');
  await expect(page.locator('[data-fixture="drag"]')).toBeVisible();

  const handle = page.locator('[data-testid="drag-handle"]');
  const box = await handle.boundingBox();
  if (!box) throw new Error('No bounding box');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  // Step 1: move mouse to handle center — no interaction yet
  console.log('Step 1: mouse.move to handle center');
  await page.mouse.move(cx, cy);
  console.log('Step 1 done');

  // Step 2: mouse.down — triggers onPointerDown + setPointerCapture
  console.log('Step 2: mouse.down');
  await page.mouse.down();
  console.log('Step 2 done');

  // Step 3: Check if page is still responsive via evaluate
  console.log('Step 3: page.evaluate');
  const result = await page.evaluate(() => 'alive');
  console.log('Step 3 result:', result);

  // Step 4: tiny mouse.move (1px) — should fire pointermove on captured element
  console.log('Step 4: mouse.move +1px');
  await page.mouse.move(cx, cy + 1, { steps: 1 });
  console.log('Step 4 done');

  // Step 5: mouse.up
  await page.mouse.up();
  console.log('All done');
});

test('debug: mouse.move WITHOUT clicking drag handle', async ({ page }) => {
  await page.goto('/#drag');
  await expect(page.locator('[data-fixture="drag"]')).toBeVisible();

  // Just move the mouse around — no pointerdown on the handle
  await page.mouse.move(100, 100);
  await page.mouse.move(150, 150);
  await page.mouse.move(200, 200);
  console.log('Free mouse moves work fine');
});

test('debug: check if page freezes after pointerdown', async ({ page }) => {
  await page.goto('/#drag');
  await expect(page.locator('[data-fixture="drag"]')).toBeVisible();

  const handle = page.locator('[data-testid="drag-handle"]');
  const box = await handle.boundingBox();
  if (!box) throw new Error('No bounding box');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  await page.mouse.move(cx, cy);
  await page.mouse.down();

  // Is the page responsive?
  const r1 = await page.evaluate(() => document.querySelector('[data-testid="is-dragging"]')?.textContent);
  console.log('isDragging after mousedown:', r1);

  // Try dispatching a pointermove via evaluate instead of CDP
  console.log('Dispatching synthetic pointermove...');
  await page.evaluate(({ x, y }) => {
    const ev = new PointerEvent('pointermove', {
      clientX: x, clientY: y, bubbles: true, isPrimary: true, pointerId: 1
    });
    document.elementFromPoint(x, y)?.dispatchEvent(ev);
  }, { x: cx, y: cy + 5 });
  console.log('Synthetic pointermove done');

  // Now try the real mouse.move
  console.log('Now trying real mouse.move...');
  await page.mouse.move(cx, cy + 2, { steps: 1 });
  console.log('Real mouse.move done');

  await page.mouse.up();
});
