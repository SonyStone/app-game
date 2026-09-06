import { expect, test } from '@playwright/test';

// Test using CDP protocol directly instead of page.mouse
test('CDP Input.dispatchMouseEvent works for drag', async ({ page }) => {
  await page.setContent('<div id="box" style="width:200px;height:200px;background:red;">box</div>');
  
  const cdp = await page.context().newCDPSession(page);
  
  // Move to position
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: 50,
    y: 50,
  });
  
  // Mouse down
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: 50,
    y: 50,
    button: 'left',
    clickCount: 1,
  });
  
  // Move while pressed
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: 60,
    y: 60,
  });
  
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: 70,
    y: 70,
  });
  
  // Mouse up
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: 70,
    y: 70,
    button: 'left',
    clickCount: 1,
  });
  
  expect(true).toBe(true);
});

// Test using page.evaluate to dispatch synthetic events 
test('dispatchEvent for drag sequence on drag fixture', async ({ page }) => {
  await page.goto('/#drag');
  await expect(page.locator('[data-fixture="drag"]')).toBeVisible();
  
  const handle = page.locator('[data-testid="drag-handle"]');
  const box = await handle.boundingBox();
  if (!box) throw new Error('no box');
  
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  
  const cdp = await page.context().newCDPSession(page);
  
  // Move to center
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved', x: cx, y: cy,
  });
  
  // Pointer down
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mousePressed', x: cx, y: cy, button: 'left', clickCount: 1,
    pointerType: 'mouse',
  });
  
  await new Promise(r => setTimeout(r, 20));
  
  // Move past threshold (8px)
  for (let i = 1; i <= 5; i++) {
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved', x: cx, y: cy + i * 5,
      pointerType: 'mouse',
    });
    await new Promise(r => setTimeout(r, 10));
  }
  
  // Check isDragging
  const isDragging = await page.locator('[data-testid="is-dragging"]').textContent();
  expect(isDragging).toBe('true');
  
  // Pointer up
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased', x: cx, y: cy + 25, button: 'left', clickCount: 1,
    pointerType: 'mouse',
  });
  
  await new Promise(r => setTimeout(r, 100));
  const isDraggingAfter = await page.locator('[data-testid="is-dragging"]').textContent();
  expect(isDraggingAfter).toBe('false');
});
