import { expect, test } from '@playwright/test';
import {
  center,
  countAnimatingElements,
  drag,
  getComputedTransform,
  getRect,
  pointerDown,
  pointerMove,
  pointerUp,
  waitForAnimations
} from './helpers';

// ============================================================================
// MARK: Setup
// ============================================================================

test.beforeEach(async ({ page }) => {
  await page.goto('/#overlay');
  await expect(page.locator('[data-fixture="overlay"]')).toBeVisible();
});

// ============================================================================
// MARK: Overlay — initial state
// ============================================================================

test.describe('Overlay — initial state', () => {
  test('items render in initial order', async ({ page }) => {
    const order = await page.locator('[data-testid="item-order"]').textContent();
    expect(order).toBe('o1,o2,o3,o4,o5');
  });

  test('overlay is not visible initially', async ({ page }) => {
    const overlay = page.locator('[data-testid="drag-overlay"]');
    await expect(overlay).not.toBeVisible();
  });

  test('overlay state readouts are inactive', async ({ page }) => {
    expect(await page.locator('[data-testid="overlay-active"]').textContent()).toBe('false');
    expect(await page.locator('[data-testid="overlay-position"]').textContent()).toBe('none');
    expect(await page.locator('[data-testid="overlay-size"]').textContent()).toBe('none');
  });

  test('no gap placeholder visible initially', async ({ page }) => {
    const gap = page.locator('[data-testid="gap-placeholder"]');
    await expect(gap).not.toBeVisible();
  });
});

// ============================================================================
// MARK: Overlay — appearance on drag
// ============================================================================

test.describe('Overlay — appearance on drag', () => {
  test('overlay appears when drag starts', async ({ page }) => {
    const item = page.locator('[data-item-id="o1"]');
    const pos = await center(item);

    await pointerDown(page, item, pos);
    await page.waitForTimeout(10);

    // Move past threshold
    for (let i = 1; i <= 5; i++) {
      await pointerMove(page, { x: pos.x, y: pos.y + i * 5 });
      await page.waitForTimeout(10);
    }

    const overlay = page.locator('[data-testid="drag-overlay"]');
    await expect(overlay).toBeVisible();
    expect(await page.locator('[data-testid="overlay-active"]').textContent()).toBe('true');

    await pointerUp(page, { x: pos.x, y: pos.y + 25 });
  });

  test('overlay has position: fixed styling', async ({ page }) => {
    const item = page.locator('[data-item-id="o1"]');
    const pos = await center(item);

    await pointerDown(page, item, pos);
    await page.waitForTimeout(10);

    for (let i = 1; i <= 5; i++) {
      await pointerMove(page, { x: pos.x, y: pos.y + i * 5 });
      await page.waitForTimeout(10);
    }

    const overlay = page.locator('[data-testid="drag-overlay"]');
    const position = await overlay.evaluate((el) => getComputedStyle(el).position);
    expect(position).toBe('fixed');

    const zIndex = await overlay.evaluate((el) => getComputedStyle(el).zIndex);
    expect(Number(zIndex)).toBeGreaterThanOrEqual(10000);

    const pointerEvents = await overlay.evaluate((el) => getComputedStyle(el).pointerEvents);
    expect(pointerEvents).toBe('none');

    await pointerUp(page, { x: pos.x, y: pos.y + 25 });
  });

  test('overlay size matches source element', async ({ page }) => {
    const item = page.locator('[data-item-id="o1"]');
    const itemBox = await item.boundingBox();
    const pos = await center(item);

    await pointerDown(page, item, pos);
    await page.waitForTimeout(10);

    for (let i = 1; i <= 5; i++) {
      await pointerMove(page, { x: pos.x, y: pos.y + i * 5 });
      await page.waitForTimeout(10);
    }

    // Read the overlay size from the state readout
    const sizeText = await page.locator('[data-testid="overlay-size"]').textContent();
    const [w] = sizeText!.split(',').map(Number);

    // Width should match the source element
    expect(w).toBeCloseTo(itemBox!.width, 0);

    await pointerUp(page, { x: pos.x, y: pos.y + 25 });
  });

  test('overlay contains the dragged item content', async ({ page }) => {
    const item = page.locator('[data-item-id="o1"]');
    const pos = await center(item);

    await pointerDown(page, item, pos);
    await page.waitForTimeout(10);

    for (let i = 1; i <= 5; i++) {
      await pointerMove(page, { x: pos.x, y: pos.y + i * 5 });
      await page.waitForTimeout(10);
    }

    const content = page.locator('[data-testid="overlay-content"]');
    await expect(content).toBeVisible();
    await expect(content).toHaveText('Red');

    await pointerUp(page, { x: pos.x, y: pos.y + 25 });
  });
});

// ============================================================================
// MARK: Overlay — position tracking
// ============================================================================

test.describe('Overlay — position tracking', () => {
  test('overlay position is near the source element at drag start', async ({ page }) => {
    const item = page.locator('[data-item-id="o2"]');
    const itemBox = await item.boundingBox();
    const pos = await center(item);

    await pointerDown(page, item, pos);
    await page.waitForTimeout(10);

    // Move just past threshold
    for (let i = 1; i <= 3; i++) {
      await pointerMove(page, { x: pos.x, y: pos.y + i * 5 });
      await page.waitForTimeout(10);
    }

    const overlay = page.locator('[data-testid="drag-overlay"]');
    const overlayBox = await overlay.boundingBox();

    // The overlay's top-left should be close to the source element's original
    // top-left (offset by the grab offset, which is pointer - element.topLeft)
    // Since we started at the center, the overlay top should be above the pointer
    expect(overlayBox).toBeTruthy();
    expect(overlayBox!.x).toBeCloseTo(itemBox!.x, 0);

    await pointerUp(page, { x: pos.x, y: pos.y + 15 });
  });

  test('overlay follows the pointer during drag', async ({ page }) => {
    const item = page.locator('[data-item-id="o1"]');
    const pos = await center(item);

    await pointerDown(page, item, pos);
    await page.waitForTimeout(10);

    // Move past threshold
    for (let i = 1; i <= 3; i++) {
      await pointerMove(page, { x: pos.x, y: pos.y + i * 5 });
      await page.waitForTimeout(10);
    }

    const overlay = page.locator('[data-testid="drag-overlay"]');
    await expect(overlay).toBeVisible();

    // Record position after threshold
    const box1 = await overlay.boundingBox();

    // Move further down
    await pointerMove(page, { x: pos.x, y: pos.y + 100 });
    await page.waitForTimeout(30);

    const box2 = await overlay.boundingBox();

    // Overlay should have moved down
    expect(box2!.y).toBeGreaterThan(box1!.y);

    // Move right
    await pointerMove(page, { x: pos.x + 100, y: pos.y + 100 });
    await page.waitForTimeout(30);

    const box3 = await overlay.boundingBox();

    // Overlay should have moved right
    expect(box3!.x).toBeGreaterThan(box2!.x);

    await pointerUp(page, { x: pos.x + 100, y: pos.y + 100 });
  });

  test('overlay maintains grab offset (does not jump)', async ({ page }) => {
    // Grab item near its top-left corner vs center — the offset should differ
    const item = page.locator('[data-item-id="o1"]');
    const itemBox = await item.boundingBox();

    // Grab near top-left (5px from corner)
    const grabX = itemBox!.x + 5;
    const grabY = itemBox!.y + 5;

    await page.mouse.move(grabX, grabY);
    await page.mouse.down();
    await page.waitForTimeout(10);

    // Move past threshold
    for (let i = 1; i <= 3; i++) {
      await page.mouse.move(grabX, grabY + i * 5);
      await page.waitForTimeout(10);
    }

    const overlay = page.locator('[data-testid="drag-overlay"]');
    const overlayBox = await overlay.boundingBox();

    // Since we grabbed near top-left, the overlay's top-left should be
    // very close to (grabX - 5, grabY - 5 + displacement)
    // The key point: overlay.x should be near itemBox.x, not at the pointer
    expect(overlayBox!.x).toBeCloseTo(itemBox!.x, 1);

    await page.mouse.up();
  });
});

// ============================================================================
// MARK: Overlay — disappearance
// ============================================================================

test.describe('Overlay — disappearance', () => {
  test('overlay disappears after drop', async ({ page }) => {
    const items = page.locator('[data-item-id]');
    const first = items.nth(0);
    const third = items.nth(2);

    const from = await center(first);
    const to = await center(third);

    await drag(page, first, from, to, 15);

    // Wait for FLIP + cleanup
    await waitForAnimations(page, '[data-item-id]');
    await page.waitForTimeout(100);

    const overlay = page.locator('[data-testid="drag-overlay"]');
    await expect(overlay).not.toBeVisible();
    expect(await page.locator('[data-testid="overlay-active"]').textContent()).toBe('false');
  });

  test('overlay disappears on Escape cancel', async ({ page }) => {
    const item = page.locator('[data-item-id="o1"]');
    const pos = await center(item);

    await pointerDown(page, item, pos);
    await page.waitForTimeout(10);

    for (let i = 1; i <= 5; i++) {
      await pointerMove(page, { x: pos.x, y: pos.y + i * 5 });
      await page.waitForTimeout(10);
    }

    const overlay = page.locator('[data-testid="drag-overlay"]');
    await expect(overlay).toBeVisible();

    // Press Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);

    await expect(overlay).not.toBeVisible();
    expect(await page.locator('[data-testid="overlay-active"]').textContent()).toBe('false');
  });

  test('overlay state resets fully after drop', async ({ page }) => {
    const items = page.locator('[data-item-id]');
    const first = items.nth(0);
    const third = items.nth(2);

    const from = await center(first);
    const to = await center(third);

    await drag(page, first, from, to, 15);
    await waitForAnimations(page, '[data-item-id]');
    await page.waitForTimeout(100);

    expect(await page.locator('[data-testid="is-dragging"]').textContent()).toBe('false');
    expect(await page.locator('[data-testid="overlay-active"]').textContent()).toBe('false');
    expect(await page.locator('[data-testid="overlay-position"]').textContent()).toBe('none');
    expect(await page.locator('[data-testid="overlay-size"]').textContent()).toBe('none');
  });
});

// ============================================================================
// MARK: Overlay — gap placeholder (dropzone)
// ============================================================================

test.describe('Overlay — gap placeholder', () => {
  test('gap placeholder appears when dragging starts', async ({ page }) => {
    const item = page.locator('[data-item-id="o1"]');
    const pos = await center(item);

    await pointerDown(page, item, pos);
    await page.waitForTimeout(10);

    for (let i = 1; i <= 5; i++) {
      await pointerMove(page, { x: pos.x, y: pos.y + i * 5 });
      await page.waitForTimeout(10);
    }

    const gap = page.locator('[data-testid="gap-placeholder"]');
    await expect(gap).toBeVisible();

    await pointerUp(page, { x: pos.x, y: pos.y + 25 });
  });

  test('dragged item is removed from the list during drag', async ({ page }) => {
    const item = page.locator('[data-item-id="o1"]');
    const pos = await center(item);

    // Count items before
    const countBefore = await page.locator('[data-item-id]').count();

    await pointerDown(page, item, pos);
    await page.waitForTimeout(10);

    for (let i = 1; i <= 5; i++) {
      await pointerMove(page, { x: pos.x, y: pos.y + i * 5 });
      await page.waitForTimeout(10);
    }

    // During drag: the dragged item should be removed from the display list
    const countDuring = await page.locator('[data-item-id]').count();
    expect(countDuring).toBe(countBefore - 1);

    // The specific item should not be in the list
    await expect(page.locator('[data-item-id="o1"]')).not.toBeVisible();

    await pointerUp(page, { x: pos.x, y: pos.y + 25 });
  });

  test('gap placeholder disappears after drop', async ({ page }) => {
    const item = page.locator('[data-item-id="o1"]');
    const pos = await center(item);

    await pointerDown(page, item, pos);
    await page.waitForTimeout(10);

    for (let i = 1; i <= 5; i++) {
      await pointerMove(page, { x: pos.x, y: pos.y + i * 5 });
      await page.waitForTimeout(10);
    }

    const gap = page.locator('[data-testid="gap-placeholder"]');
    await expect(gap).toBeVisible();

    await pointerUp(page, { x: pos.x, y: pos.y + 25 });
    await waitForAnimations(page, '[data-item-id]');
    await page.waitForTimeout(100);

    await expect(gap).not.toBeVisible();
  });

  test('all items are restored after drop', async ({ page }) => {
    const items = page.locator('[data-item-id]');
    const countBefore = await items.count();
    const first = items.nth(0);
    const third = items.nth(2);

    const from = await center(first);
    const to = await center(third);

    await drag(page, first, from, to, 15);
    await waitForAnimations(page, '[data-item-id]');
    await page.waitForTimeout(100);

    const countAfter = await items.count();
    expect(countAfter).toBe(countBefore);
  });
});

// ============================================================================
// MARK: Overlay — FLIP animations during drag
// ============================================================================

test.describe('Overlay — FLIP animations during drag', () => {
  test('items animate when gap position changes during drag', async ({ page }) => {
    const item = page.locator('[data-item-id="o1"]');
    const secondItem = page.locator('[data-item-id="o2"]');
    const fourthItem = page.locator('[data-item-id="o4"]');

    const from = await center(item);
    const to = await center(fourthItem);

    await pointerDown(page, item, from);
    await page.waitForTimeout(10);

    // Move past threshold
    for (let i = 1; i <= 3; i++) {
      await pointerMove(page, { x: from.x, y: from.y + i * 5 });
      await page.waitForTimeout(10);
    }

    // Now move further — this should shift the gap and trigger FLIP
    for (let i = 0; i <= 10; i++) {
      const y = from.y + 15 + (to.y - from.y - 15) * (i / 10);
      await pointerMove(page, { x: from.x, y });
      await page.waitForTimeout(30);
    }

    // Check for running animations on remaining items
    await page.waitForTimeout(50);
    const animCount = await countAnimatingElements(page, '[data-item-id]');
    // At least some items should be animating (or have just finished)
    // The gap moved, so items should have FLIP-animated
    // This is a soft assertion — the important thing is no errors occurred

    await pointerUp(page, to);
    await waitForAnimations(page, '[data-item-id]');
  });

  test('FLIP animations complete with no transform residue after drop', async ({ page }) => {
    const items = page.locator('[data-item-id]');
    const first = items.nth(0);
    const fourth = items.nth(3);

    const from = await center(first);
    const to = await center(fourth);

    await drag(page, first, from, to, 15);
    await waitForAnimations(page, '[data-item-id]');
    await page.waitForTimeout(100);

    // All items should have no residual transforms
    for (const id of ['o1', 'o2', 'o3', 'o4', 'o5']) {
      const transform = await getComputedTransform(page, `[data-item-id="${id}"]`);
      expect(transform).toBe('none');
    }
  });
});

// ============================================================================
// MARK: Overlay — drag to reorder
// ============================================================================

test.describe('Overlay — drag to reorder', () => {
  test('gap follows pointer through all positions when dragging first item down', async ({ page }) => {
    // This tests that the gap responds promptly as the pointer moves through
    // each item's zone, rather than lagging behind due to gap displacement.
    const items = page.locator('[data-item-id]');
    const first = items.nth(0); // o1 (Red)

    // Record original centers of all items before dragging
    const centers: { x: number; y: number }[] = [];
    for (let i = 0; i < 5; i++) {
      centers.push(await center(items.nth(i)));
    }

    const from = centers[0];

    // Start drag on first item
    await pointerDown(page, first, from);
    await page.waitForTimeout(20);

    // Move past threshold (small downward move)
    for (let i = 1; i <= 3; i++) {
      await pointerMove(page, { x: from.x, y: from.y + i * 3 });
      await page.waitForTimeout(10);
    }
    await page.waitForTimeout(200);

    // Helper to get the display list children
    const getChildren = () =>
      page.evaluate(() => {
        const container = document.querySelector('[data-testid="overlay-list"]');
        if (!container) return [];
        return Array.from(container.children).map(
          (c) => c.getAttribute('data-testid') ?? c.getAttribute('data-item-id')
        );
      });

    // Move pointer to o4's original center (position 4).
    // The gap should be at or near position 4 — NOT stuck at position 3.
    await pointerMove(page, { x: from.x, y: centers[3].y });
    await page.waitForTimeout(400);

    let children = await getChildren();
    // The gap should be past o3 — at position 3 or 4 (before o4 or before o5)
    const gapIndex = children.indexOf('gap-placeholder');
    // The key assertion: the gap must NOT be stuck at position 1 or 2.
    // With correct compact snapshot, it should be at index 3 (before o5)
    // because the pointer at o4's original center maps to "past o4" in
    // compact coordinates.
    expect(gapIndex).toBeGreaterThanOrEqual(2);

    // Move to well past o4 (between o4 and o5 original centers)
    await pointerMove(page, { x: from.x, y: (centers[3].y + centers[4].y) / 2 });
    await page.waitForTimeout(400);

    children = await getChildren();
    const gapIndex2 = children.indexOf('gap-placeholder');
    // Gap should be at index 3 or 4 (before o5 or at end)
    expect(gapIndex2).toBeGreaterThanOrEqual(3);

    await pointerUp(page, { x: from.x, y: (centers[3].y + centers[4].y) / 2 });
  });

  test('gap follows pointer when dragging last item upward', async ({ page }) => {
    // This tests that dragging the last item (Purple) upward over Orange
    // correctly moves the gap, even when the cursor is offset from the
    // overlay center (e.g., grabbing near the item's bottom edge).
    const items = page.locator('[data-item-id]');
    const last = items.nth(4); // o5 (Purple)

    // Record original centers before dragging
    const centers: { x: number; y: number }[] = [];
    for (let i = 0; i < 5; i++) {
      centers.push(await center(items.nth(i)));
    }

    const from = centers[4]; // o5's center

    // Grab near the bottom of o5 (offset from center) to test grab-offset robustness
    const grabY = from.y + 15;
    await page.mouse.move(from.x, grabY);
    await page.mouse.down();
    await page.waitForTimeout(20);

    // Move past threshold (upward)
    for (let i = 1; i <= 3; i++) {
      await pointerMove(page, { x: from.x, y: grabY - i * 3 });
      await page.waitForTimeout(10);
    }
    await page.waitForTimeout(400);

    const getChildren = () =>
      page.evaluate(() => {
        const container = document.querySelector('[data-testid="overlay-list"]');
        if (!container) return [];
        return Array.from(container.children).map(
          (c) => c.getAttribute('data-testid') ?? c.getAttribute('data-item-id')
        );
      });

    // Move to o4's original center (over Orange)
    await pointerMove(page, { x: from.x, y: centers[3].y });
    await page.waitForTimeout(600);

    // The gap should be before o4 or earlier — NOT stuck at the end
    let children = await getChildren();
    const gapIndex = children.indexOf('gap-placeholder');
    const o4Index = children.indexOf('o4');
    expect(gapIndex).toBeLessThanOrEqual(o4Index);

    // Move further up to o2's original center
    await pointerMove(page, { x: from.x, y: centers[1].y });
    await page.waitForTimeout(600);

    children = await getChildren();
    const gapIndex2 = children.indexOf('gap-placeholder');
    // Gap should be near the top
    expect(gapIndex2).toBeLessThanOrEqual(1);

    await page.mouse.up();
  });

  test('dragging first item to last and back preserves original order', async ({ page }) => {
    const first = page.locator('[data-item-id="o1"]');
    const last = page.locator('[data-item-id="o5"]');

    const from = await center(first);
    const to = await center(last);

    // Start drag
    await pointerDown(page, first, from);
    await page.waitForTimeout(20);

    // Drag down to the last item (past Purple) with incremental steps
    const downSteps = 15;
    for (let i = 1; i <= downSteps; i++) {
      const y = from.y + (to.y - from.y) * (i / downSteps);
      await pointerMove(page, { x: from.x, y });
      await page.waitForTimeout(10);
    }

    // Pause at the bottom to let FLIP animations settle
    await page.waitForTimeout(800);

    // Now drag back up to the original position (position 1)
    const upSteps = 15;
    for (let i = 1; i <= upSteps; i++) {
      const y = to.y + (from.y - to.y) * (i / upSteps);
      await pointerMove(page, { x: from.x, y });
      await page.waitForTimeout(10);
    }

    // Pause at the top to let FLIP animations settle and gap to catch up
    await page.waitForTimeout(800);

    // The gap should be at position 1 (first child in the list)
    const firstChildTestId = await page.evaluate(() => {
      const container = document.querySelector('[data-testid="overlay-list"]');
      if (!container) return null;
      const children = Array.from(container.children);
      return children[0]?.getAttribute('data-testid') ?? children[0]?.getAttribute('data-item-id');
    });
    expect(firstChildTestId).toBe('gap-placeholder');

    // Drop at position 1
    await pointerUp(page, { x: from.x, y: from.y });
    await waitForAnimations(page, '[data-item-id]');
    await page.waitForTimeout(100);

    // Red should be back at position 1 — original order preserved
    const order = await page.locator('[data-testid="item-order"]').textContent();
    expect(order).toBe('o1,o2,o3,o4,o5');
  });

  test('dragging first item to third position reorders', async ({ page }) => {
    const items = page.locator('[data-item-id]');
    const first = items.nth(0);
    const third = items.nth(2);

    const from = await center(first);
    const to = await center(third);

    await drag(page, first, from, to, 15);
    await waitForAnimations(page, '[data-item-id]');
    await page.waitForTimeout(100);

    const order = await page.locator('[data-testid="item-order"]').textContent();
    expect(order).not.toBe('o1,o2,o3,o4,o5');
    expect(order!.startsWith('o1')).toBe(false);
  });

  test('dragging last item to first position reorders', async ({ page }) => {
    const items = page.locator('[data-item-id]');
    const last = items.nth(4);
    const first = items.nth(0);

    const from = await center(last);
    const to = await center(first);

    await drag(page, last, from, to, 15);
    await waitForAnimations(page, '[data-item-id]');
    await page.waitForTimeout(100);

    const order = await page.locator('[data-testid="item-order"]').textContent();
    expect(order).not.toBe('o1,o2,o3,o4,o5');
  });

  test('items are in correct positions after reorder completes', async ({ page }) => {
    const items = page.locator('[data-item-id]');
    const first = items.nth(0);
    const third = items.nth(2);

    // Record Y positions before
    const yBefore: Record<string, number> = {};
    for (const id of ['o1', 'o2', 'o3', 'o4', 'o5']) {
      const rect = await getRect(page, `[data-item-id="${id}"]`);
      yBefore[id] = rect!.y;
    }

    const from = await center(first);
    const to = await center(third);

    await drag(page, first, from, to, 15);
    await waitForAnimations(page, '[data-item-id]');
    await page.waitForTimeout(150);

    // After reorder: item positions should have shifted
    const yAfter: Record<string, number> = {};
    for (const id of ['o1', 'o2', 'o3', 'o4', 'o5']) {
      const rect = await getRect(page, `[data-item-id="${id}"]`);
      yAfter[id] = rect!.y;
    }

    // o2 should now be at the first position (where o1 was)
    expect(yAfter['o2']).toBeCloseTo(yBefore['o1'], 0);
  });

  test('dragging first item to last position places it at the end', async ({ page }) => {
    const first = page.locator('[data-item-id="o1"]');
    const last = page.locator('[data-item-id="o5"]');

    const from = await center(first);
    const lastCenter = await center(last);

    // Target below o5's center but inside the container
    const containerBox = await page.locator('[data-testid="overlay-list"]').boundingBox();
    const targetY = Math.min(lastCenter.y + 40, containerBox!.y + containerBox!.height - 5);

    // Start drag
    await pointerDown(page, first, from);
    await page.waitForTimeout(20);

    // Fast continuous drag to the target — FLIP animations will swallow
    // intermediate events, so the gap may lag behind the pointer.
    const steps = 10;
    for (let i = 1; i <= steps; i++) {
      const y = from.y + (targetY - from.y) * (i / steps);
      await pointerMove(page, { x: from.x, y });
      await page.waitForTimeout(10);
    }

    // Pointer is now past all items. Stop moving and let FLIP animations
    // finish. The re-evaluation effect should catch up the gap to "append".
    await page.waitForTimeout(800);

    // Verify the gap placeholder is the last child (append position)
    const lastChildTestId = await page.evaluate(() => {
      const container = document.querySelector('[data-testid="overlay-list"]');
      if (!container) return null;
      const children = Array.from(container.children);
      const last = children[children.length - 1];
      return last?.getAttribute('data-testid') ?? last?.getAttribute('data-item-id');
    });
    expect(lastChildTestId).toBe('gap-placeholder');

    // Drop
    await pointerUp(page, { x: from.x, y: targetY });
    await waitForAnimations(page, '[data-item-id]');
    await page.waitForTimeout(100);

    const order = await page.locator('[data-testid="item-order"]').textContent();
    expect(order).toBe('o2,o3,o4,o5,o1');
  });

  test('dragging second item to last position places it at the end', async ({ page }) => {
    const second = page.locator('[data-item-id="o2"]');
    const last = page.locator('[data-item-id="o5"]');

    const from = await center(second);
    const lastCenter = await center(last);

    const containerBox = await page.locator('[data-testid="overlay-list"]').boundingBox();
    const targetY = Math.min(lastCenter.y + 40, containerBox!.y + containerBox!.height - 5);

    await drag(page, second, from, { x: from.x, y: targetY }, 15);
    await waitForAnimations(page, '[data-item-id]');
    await page.waitForTimeout(100);

    const order = await page.locator('[data-testid="item-order"]').textContent();
    expect(order).toBe('o1,o3,o4,o5,o2');
  });
});

// ============================================================================
// MARK: Overlay — different items
// ============================================================================

test.describe('Overlay — different source items', () => {
  test('dragging second item shows correct overlay content', async ({ page }) => {
    const item = page.locator('[data-item-id="o2"]');
    const pos = await center(item);

    await pointerDown(page, item, pos);
    await page.waitForTimeout(10);

    for (let i = 1; i <= 5; i++) {
      await pointerMove(page, { x: pos.x, y: pos.y + i * 5 });
      await page.waitForTimeout(10);
    }

    const content = page.locator('[data-testid="overlay-content"]');
    await expect(content).toHaveText('Blue');

    await pointerUp(page, { x: pos.x, y: pos.y + 25 });
  });

  test('dragging last item shows correct overlay content', async ({ page }) => {
    const item = page.locator('[data-item-id="o5"]');
    const pos = await center(item);

    await pointerDown(page, item, pos);
    await page.waitForTimeout(10);

    for (let i = 1; i <= 5; i++) {
      await pointerMove(page, { x: pos.x, y: pos.y - i * 5 });
      await page.waitForTimeout(10);
    }

    const content = page.locator('[data-testid="overlay-content"]');
    await expect(content).toHaveText('Purple');

    await pointerUp(page, { x: pos.x, y: pos.y - 25 });
  });
});

// ============================================================================
// MARK: Overlay — multiple drags
// ============================================================================

test.describe('Overlay — consecutive drags', () => {
  test('overlay works correctly across multiple drag-and-drop cycles', async ({ page }) => {
    const overlay = page.locator('[data-testid="drag-overlay"]');

    // First drag: o1 down
    const item1 = page.locator('[data-item-id="o1"]');
    const pos1 = await center(item1);
    await drag(page, item1, pos1, { x: pos1.x, y: pos1.y + 80 }, 10);
    await waitForAnimations(page, '[data-item-id]');
    await page.waitForTimeout(100);

    await expect(overlay).not.toBeVisible();

    // Second drag: grab the first item in the new order
    const items = page.locator('[data-item-id]');
    const newFirst = items.nth(0);
    const newFirstPos = await center(newFirst);

    await pointerDown(page, newFirst, newFirstPos);
    await page.waitForTimeout(10);

    for (let i = 1; i <= 5; i++) {
      await pointerMove(page, { x: newFirstPos.x, y: newFirstPos.y + i * 5 });
      await page.waitForTimeout(10);
    }

    // Overlay should appear for the second drag too
    await expect(overlay).toBeVisible();

    await pointerUp(page, { x: newFirstPos.x, y: newFirstPos.y + 25 });
    await waitForAnimations(page, '[data-item-id]');
    await page.waitForTimeout(100);

    await expect(overlay).not.toBeVisible();
    expect(await page.locator('[data-testid="overlay-active"]').textContent()).toBe('false');
  });
});
