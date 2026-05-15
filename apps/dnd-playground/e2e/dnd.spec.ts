import { expect, Locator, Page, test } from '@playwright/test';

// ============================================================================
// MARK: Helpers
// ============================================================================

/**
 * Dispatches a PointerEvent via page.evaluate.
 *
 * Playwright's `page.mouse.*` methods use CDP Input.dispatchMouseEvent, which
 * hangs in headless Chromium inside Docker containers (the compositor never
 * produces a frame to acknowledge the input). Using `dispatchEvent` on the
 * JS side works reliably because it bypasses the compositor entirely.
 */
async function pointerDown(page: Page, el: Locator, pos: { x: number; y: number }) {
  await el.dispatchEvent('pointerdown', {
    clientX: pos.x,
    clientY: pos.y,
    button: 0,
    pointerId: 1,
    isPrimary: true,
    pointerType: 'mouse'
  });
}

async function pointerMove(page: Page, pos: { x: number; y: number }) {
  await page.evaluate(({ x, y }) => {
    document.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true, pointerId: 1 }));
  }, pos);
}

async function pointerUp(page: Page, pos: { x: number; y: number }) {
  await page.evaluate(({ x, y }) => {
    document.dispatchEvent(new PointerEvent('pointerup', { clientX: x, clientY: y, bubbles: true, pointerId: 1 }));
  }, pos);
}

/**
 * Simulates a full drag-and-drop sequence via dispatchEvent.
 * Moves in incremental steps to trigger the drag threshold and produce
 * realistic pointermove events.
 */
async function drag(
  page: Page,
  handle: Locator,
  from: { x: number; y: number },
  to: { x: number; y: number },
  steps = 10
) {
  await pointerDown(page, handle, from);
  await page.waitForTimeout(20);

  for (let i = 1; i <= steps; i++) {
    const x = from.x + (to.x - from.x) * (i / steps);
    const y = from.y + (to.y - from.y) * (i / steps);
    await pointerMove(page, { x, y });
    await page.waitForTimeout(10);
  }

  await pointerUp(page, to);
}

/** Returns the center of a locator's bounding box. */
async function center(loc: Locator) {
  const box = await loc.boundingBox();
  if (!box) throw new Error('Element not found');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

// ============================================================================
// MARK: Setup
// ============================================================================

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-block-type="brush"]').first()).toBeVisible();
});

// ============================================================================
// MARK: Initial Render
// ============================================================================

test.describe('Initial render', () => {
  test('shows the DnD Playground header', async ({ page }) => {
    await expect(page.locator('h1')).toHaveText('DnD Playground');
  });

  test('renders brush items', async ({ page }) => {
    const brushes = page.locator('[data-block-type="brush"]');
    await expect(brushes.first()).toBeVisible();
    expect(await brushes.count()).toBeGreaterThan(0);
  });

  test('renders group items', async ({ page }) => {
    const groups = page.locator('[data-block-type="group"]');
    await expect(groups.first()).toBeVisible();
    expect(await groups.count()).toBeGreaterThan(0);
  });

  test('shows correct brush and group counts in header', async ({ page }) => {
    const header = page.locator('header');
    await expect(header).toContainText('brushes');
    await expect(header).toContainText('groups');
  });
});

// ============================================================================
// MARK: Selection
// ============================================================================

test.describe('Selection', () => {
  test('clicking a brush selects it', async ({ page }) => {
    const brush = page.locator('[data-block-type="brush"]').first();
    // force: true skips the "stable" actionability check, which can hang in
    // headless Docker because the FLIP animation system continuously updates
    // inline transform/width styles across frames.
    await brush.click({ force: true });

    await expect(page.locator('text=Last:')).toContainText('Select');
    await expect(page.locator('text=Selected:')).toContainText('1');
  });

  test('clicking another brush replaces selection', async ({ page }) => {
    const brushes = page.locator('[data-block-type="brush"]');
    await brushes.nth(0).click({ force: true });
    await expect(page.locator('text=Selected:')).toContainText('1');

    await brushes.nth(1).click({ force: true });
    await expect(page.locator('text=Selected:')).toContainText('1');
  });

  test('ctrl+click adds to selection', async ({ page }) => {
    const brushes = page.locator('[data-block-type="brush"]');
    await brushes.nth(0).click({ force: true });
    await brushes.nth(1).click({ force: true, modifiers: ['ControlOrMeta'] });

    await expect(page.locator('text=Selected:')).toContainText('2');
  });

  test('clicking a group selects it', async ({ page }) => {
    const group = page.locator('[data-block-type="group"]').first();
    await group.click({ force: true });

    await expect(page.locator('text=Last:')).toContainText('Select');
  });
});

// ============================================================================
// MARK: Drag and Drop
// ============================================================================

test.describe('Drag and Drop', () => {
  test('dragging a brush shows a drag ghost', async ({ page }) => {
    const brush = page.locator('[data-block-type="brush"]').first();
    const pos = await center(brush);

    await pointerDown(page, brush, pos);
    await page.waitForTimeout(20);

    // Move past the drag threshold (10px)
    for (let i = 1; i <= 5; i++) {
      await pointerMove(page, { x: pos.x, y: pos.y + i * 10 });
      await page.waitForTimeout(10);
    }

    // The drag ghost is a div with position:fixed and z-index:10000
    const ghost = page.locator('div[style*="position: fixed"][style*="z-index: 10000"]');
    await expect(ghost).toBeVisible();

    await pointerUp(page, { x: pos.x, y: pos.y + 50 });
  });

  test('dragging a brush and dropping reorders items', async ({ page }) => {
    const brushes = page.locator('[data-block-type="brush"]');
    const first = brushes.nth(0);
    const third = brushes.nth(2);

    const from = await center(first);
    const to = await center(third);

    await drag(page, first, from, to, 15);
    await page.waitForTimeout(300);

    await expect(page.locator('text=Last:')).toContainText('Reorder');
  });

  test('drag ghost disappears on drop', async ({ page }) => {
    const brush = page.locator('[data-block-type="brush"]').first();
    const pos = await center(brush);

    await pointerDown(page, brush, pos);
    await page.waitForTimeout(20);

    for (let i = 1; i <= 5; i++) {
      await pointerMove(page, { x: pos.x, y: pos.y + i * 10 });
      await page.waitForTimeout(10);
    }

    const ghost = page.locator('div[style*="position: fixed"][style*="z-index: 10000"]');
    await expect(ghost).toBeVisible();

    await pointerUp(page, { x: pos.x, y: pos.y + 50 });
    await expect(ghost).not.toBeVisible();
  });

  test('drag ghost follows the pointer', async ({ page }) => {
    const brush = page.locator('[data-block-type="brush"]').first();
    const pos = await center(brush);

    await pointerDown(page, brush, pos);
    await page.waitForTimeout(20);

    // Move down in steps
    for (let i = 1; i <= 5; i++) {
      await pointerMove(page, { x: pos.x, y: pos.y + i * 16 });
      await page.waitForTimeout(10);
    }

    const ghost = page.locator('div[style*="position: fixed"][style*="z-index: 10000"]');
    await expect(ghost).toBeVisible();

    const ghostBox = await ghost.boundingBox();
    expect(ghostBox).toBeTruthy();
    // Ghost should have moved below the original position
    expect(ghostBox!.y).toBeGreaterThan(pos.y);

    await pointerUp(page, { x: pos.x, y: pos.y + 80 });
  });

  test('can drop a brush as the last item in a wrap group', async ({ page }) => {
    // "Drawing Tools" is the first group — its children are in a flex-wrap row:
    //   [Hard Round] [Soft Round] [Flat Blunt]
    // We drag "Hard Round" to the right of "Flat Blunt" (the last item).
    const firstGroup = page.locator('[data-block-type="group"]').first();
    const brushesInGroup = firstGroup.locator('[data-block-type="brush"]');

    const firstName = await brushesInGroup.nth(0).locator('span').first().textContent();
    const lastName = await brushesInGroup.nth(2).locator('span').first().textContent();

    const firstBrush = brushesInGroup.nth(0);
    const lastBrush = brushesInGroup.nth(2);

    const from = await center(firstBrush);
    const lastBox = await lastBrush.boundingBox();
    if (!lastBox) throw new Error('Last brush not found');

    // Target: well to the right of the last item. The DnD system measures the
    // position where the dragged item's top-left would land (pointer + offset),
    // so we need to overshoot to land past the "at end" insertion point center.
    const to = { x: lastBox.x + lastBox.width + 120, y: lastBox.y + lastBox.height / 2 };

    await drag(page, firstBrush, from, to, 20);
    await page.waitForTimeout(400);

    // The reorder should have happened
    await expect(page.locator('text=Last:')).toContainText('Reorder');

    // The first brush in the group should now be what was previously second
    const newFirst = await brushesInGroup.nth(0).locator('span').first().textContent();
    expect(newFirst).not.toBe(firstName);

    // The last brush in the group should now be the one we dragged
    const newLast = await brushesInGroup.nth(2).locator('span').first().textContent();
    expect(newLast).toBe(firstName);
  });
});

// ============================================================================
// MARK: Keyboard
// ============================================================================

test.describe('Keyboard', () => {
  test('pressing Delete removes selected items', async ({ page }) => {
    const initialCount = await page.locator('[data-block-type="brush"]').count();

    await page.locator('[data-block-type="brush"]').first().click({ force: true });
    await page.keyboard.press('Delete');
    await page.waitForTimeout(300);

    const finalCount = await page.locator('[data-block-type="brush"]').count();
    expect(finalCount).toBe(initialCount - 1);
    await expect(page.locator('text=Last:')).toContainText('Remove');
  });
});

// ============================================================================
// MARK: Group Collapse
// ============================================================================

test.describe('Group collapse', () => {
  test('clicking collapse button hides children', async ({ page }) => {
    const collapseBtn = page.locator('[data-block-type="group"] button').first();
    await expect(collapseBtn).toBeVisible();

    const firstGroup = page.locator('[data-block-type="group"]').first();
    const brushesBefore = await firstGroup.locator('[data-block-type="brush"]').count();

    // The collapse button calls stopPropagation on pointerdown so it doesn't
    // interact with the DnD system. force:true is fine here.
    await collapseBtn.click({ force: true });

    const brushesAfter = await firstGroup.locator('[data-block-type="brush"]').count();
    expect(brushesAfter).toBeLessThan(brushesBefore);
  });
});
