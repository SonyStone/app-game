import { test, expect } from '@playwright/test';

/**
 * Dispatch a PointerEvent directly on the element that currently holds pointer capture.
 * This bypasses the bugged Playwright CDP mouse.move while still triggering the
 * drag sensor's pointermove handler.
 */
async function dispatchPointerEvent(
  page: import('@playwright/test').Page,
  type: string,
  pos: { x: number; y: number },
  options: { buttons?: number; button?: number } = {}
) {
  await page.evaluate(({ type, x, y, buttons, button }) => {
    // Find the element currently capturing pointer events:
    // 1. Proxy element (created by createDragSensor with proxyCapture: true)
    // 2. Any element that has pointer capture for pointerId 1
    // 3. Fall back to elementFromPoint
    let target: Element | null = document.querySelector('[data-dnd-capture-proxy]');

    if (!target) {
      // Walk all elements with pointer event handlers to find the capturing one
      // hasPointerCapture(1) tells us if the element is capturing pointerId 1
      const candidates = document.querySelectorAll('*');
      for (const el of candidates) {
        try {
          if ((el as HTMLElement).hasPointerCapture && (el as HTMLElement).hasPointerCapture(1)) {
            target = el;
            break;
          }
        } catch { /* ignore */ }
      }
    }

    if (!target) {
      target = document.elementFromPoint(x, y) || document.documentElement;
    }

    target.dispatchEvent(new PointerEvent(type, {
      clientX: x, clientY: y,
      bubbles: true, cancelable: true,
      isPrimary: true, pointerId: 1,
      pointerType: 'mouse',
      button: button ?? -1,
      buttons: buttons ?? 1,
    }));
  }, { type, x: pos.x, y: pos.y, buttons: options.buttons, button: options.button });
}

// ============================================================================
// MARK: Test the workaround with DragFixture
// ============================================================================

test.beforeEach(async ({ page }) => {
  await page.goto('/#drag');
  await expect(page.locator('[data-fixture="drag"]')).toBeVisible();
});

test('drag with synthetic pointermove: threshold detection', async ({ page }) => {
  const handle = page.locator('[data-testid="drag-handle"]');
  const box = await handle.boundingBox();
  if (!box) throw new Error('No bounding box');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  // pointerDown: position + mousedown (real browser events)
  await page.mouse.move(cx, cy, { steps: 0 });
  await page.mouse.down();

  // Wait for event processing
  await page.waitForTimeout(20);

  // Move past threshold (8px) using synthetic pointermove
  for (let i = 1; i <= 5; i++) {
    await dispatchPointerEvent(page, 'pointermove', { x: cx, y: cy + i * 5 });
    await page.waitForTimeout(10);
  }

  // Check if dragging was detected
  const isDragging = await page.locator('[data-testid="is-dragging"]').textContent();
  console.log('isDragging:', isDragging);
  expect(isDragging).toBe('true');

  const lastEvent = await page.locator('[data-testid="last-event"]').textContent();
  console.log('lastEvent:', lastEvent);
  expect(lastEvent).toMatch(/^drag-start:/);

  // Release: mouseup (real browser event)
  await page.mouse.up();
  await page.waitForTimeout(20);

  const isDraggingAfter = await page.locator('[data-testid="is-dragging"]').textContent();
  expect(isDraggingAfter).toBe('false');

  const endEvent = await page.locator('[data-testid="last-event"]').textContent();
  console.log('endEvent:', endEvent);
  expect(endEvent).toMatch(/^drag-end:/);
});

test('drag with synthetic pointermove: delta tracking', async ({ page }) => {
  const handle = page.locator('[data-testid="drag-handle"]');
  const box = await handle.boundingBox();
  if (!box) throw new Error('No bounding box');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  await page.mouse.move(cx, cy, { steps: 0 });
  await page.mouse.down();
  await page.waitForTimeout(20);

  // Move past threshold
  await dispatchPointerEvent(page, 'pointermove', { x: cx, y: cy + 20 });
  await page.waitForTimeout(10);

  // Move further
  await dispatchPointerEvent(page, 'pointermove', { x: cx + 50, y: cy + 100 });
  await page.waitForTimeout(10);

  const delta = await page.locator('[data-testid="drag-delta"]').textContent();
  console.log('delta:', delta);
  expect(delta).toBe('50,100');

  await page.mouse.up();
});

test('click with synthetic: under threshold fires click', async ({ page }) => {
  const handle = page.locator('[data-testid="drag-handle"]');
  const box = await handle.boundingBox();
  if (!box) throw new Error('No bounding box');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  await page.mouse.move(cx, cy, { steps: 0 });
  await page.mouse.down();
  await page.waitForTimeout(10);

  // Move only 3px (under 8px threshold)
  await dispatchPointerEvent(page, 'pointermove', { x: cx + 2, y: cy + 2 });
  await page.waitForTimeout(10);

  // Release via synthetic pointerup on the handle
  await dispatchPointerEvent(page, 'pointerup', { x: cx + 2, y: cy + 2 }, { button: 0, buttons: 0 });
  await page.waitForTimeout(20);

  const lastEvent = await page.locator('[data-testid="last-event"]').textContent();
  console.log('lastEvent:', lastEvent);
  expect(lastEvent).toBe('click');
});

test('Escape cancels drag with synthetic pointermove', async ({ page }) => {
  const handle = page.locator('[data-testid="drag-handle"]');
  const box = await handle.boundingBox();
  if (!box) throw new Error('No bounding box');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  await page.mouse.move(cx, cy, { steps: 0 });
  await page.mouse.down();
  await page.waitForTimeout(20);

  // Move past threshold
  for (let i = 1; i <= 5; i++) {
    await dispatchPointerEvent(page, 'pointermove', { x: cx, y: cy + i * 5 });
    await page.waitForTimeout(10);
  }

  expect(await page.locator('[data-testid="is-dragging"]').textContent()).toBe('true');

  // Press Escape
  await page.keyboard.press('Escape');
  await page.waitForTimeout(20);

  expect(await page.locator('[data-testid="is-dragging"]').textContent()).toBe('false');
  expect(await page.locator('[data-testid="last-event"]').textContent()).toBe('drag-cancel');
});
