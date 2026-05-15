import { expect, test } from '@playwright/test';
import {
  center,
  countAnimatingElements,
  drag,
  getComputedTransform,
  pointerDown,
  pointerMove,
  pointerUp,
  waitForAnimations
} from './helpers';

// ============================================================================
// MARK: Setup
// ============================================================================

test.beforeEach(async ({ page }) => {
  await page.goto('/#sortable');
  await expect(page.locator('[data-fixture="sortable"]')).toBeVisible();
});

// ============================================================================
// MARK: Sortable — initial state
// ============================================================================

test.describe('Sortable — initial state', () => {
  test('items render in initial order', async ({ page }) => {
    const order = await page.locator('[data-testid="item-order"]').textContent();
    expect(order).toBe('s1,s2,s3,s4,s5');
  });

  test('isDragging is false initially', async ({ page }) => {
    expect(await page.locator('[data-testid="is-dragging"]').textContent()).toBe('false');
  });
});

// ============================================================================
// MARK: Sortable — drag to reorder
// ============================================================================

test.describe('Sortable — drag to reorder', () => {
  test('dragging first item down reorders the list', async ({ page }) => {
    const items = page.locator('[data-item-id]');
    const first = items.nth(0);
    const third = items.nth(2);

    const from = await center(first);
    const to = await center(third);

    await drag(page, first, from, to, 15);
    await waitForAnimations(page, '[data-item-id]');
    await page.waitForTimeout(100);

    const order = await page.locator('[data-testid="item-order"]').textContent();
    // s1 should have moved past s2 and s3
    expect(order).not.toBe('s1,s2,s3,s4,s5');
    // s1 should no longer be first
    expect(order!.startsWith('s1')).toBe(false);
  });

  test('dragging last item up reorders the list', async ({ page }) => {
    const items = page.locator('[data-item-id]');
    const last = items.nth(4);
    const second = items.nth(1);

    const from = await center(last);
    const to = await center(second);

    await drag(page, last, from, to, 15);
    await waitForAnimations(page, '[data-item-id]');
    await page.waitForTimeout(100);

    const order = await page.locator('[data-testid="item-order"]').textContent();
    expect(order).not.toBe('s1,s2,s3,s4,s5');
  });
});

// ============================================================================
// MARK: Sortable — FLIP animations during reorder
// ============================================================================

test.describe('Sortable — FLIP animations on drop', () => {
  test('FLIP animations run after drop', async ({ page }) => {
    const items = page.locator('[data-item-id]');
    const first = items.nth(0);
    const fourth = items.nth(3);

    const from = await center(first);
    const to = await center(fourth);

    await drag(page, first, from, to, 15);

    // Immediately after drop, animations should start
    await page.waitForTimeout(30);
    const animCount = await countAnimatingElements(page, '[data-item-id]');
    expect(animCount).toBeGreaterThan(0);

    // Wait for them to finish
    await waitForAnimations(page, '[data-item-id]');
  });

  test('no transform residue after FLIP animation completes', async ({ page }) => {
    const items = page.locator('[data-item-id]');
    const first = items.nth(0);
    const third = items.nth(2);

    const from = await center(first);
    const to = await center(third);

    await drag(page, first, from, to, 15);
    await waitForAnimations(page, '[data-item-id]');
    await page.waitForTimeout(100);

    // All items should have no residual transform
    for (const id of ['s1', 's2', 's3', 's4', 's5']) {
      const transform = await getComputedTransform(page, `[data-item-id="${id}"]`);
      expect(transform).toBe('none');
    }
  });

  test('isAnimating goes true then false during reorder', async ({ page }) => {
    const items = page.locator('[data-item-id]');
    const first = items.nth(0);
    const third = items.nth(2);

    const from = await center(first);
    const to = await center(third);

    await drag(page, first, from, to, 15);
    await page.waitForTimeout(30);

    // Should be animating right after drop
    expect(await page.locator('[data-testid="is-animating"]').textContent()).toBe('true');

    await waitForAnimations(page, '[data-item-id]');
    await page.waitForTimeout(100);

    // Should be done
    expect(await page.locator('[data-testid="is-animating"]').textContent()).toBe('false');
  });
});

// ============================================================================
// MARK: Sortable — drag state
// ============================================================================

test.describe('Sortable — drag state', () => {
  test('isDragging becomes true during drag', async ({ page }) => {
    const items = page.locator('[data-item-id]');
    const first = items.nth(0);
    const pos = await center(first);

    await pointerDown(page, first, pos);
    await page.waitForTimeout(10);

    // Move past threshold
    for (let i = 1; i <= 5; i++) {
      await pointerMove(page, { x: pos.x, y: pos.y + i * 5 });
      await page.waitForTimeout(10);
    }

    expect(await page.locator('[data-testid="is-dragging"]').textContent()).toBe('true');

    // Drop indicator should appear
    const indicator = page.locator('[data-testid="drop-indicator"]');
    await expect(indicator).toBeVisible();

    await pointerUp(page, { x: pos.x, y: pos.y + 25 });
  });

  test('drop indicator disappears after drop', async ({ page }) => {
    const items = page.locator('[data-item-id]');
    const first = items.nth(0);
    const pos = await center(first);

    await pointerDown(page, first, pos);
    await page.waitForTimeout(10);

    for (let i = 1; i <= 5; i++) {
      await pointerMove(page, { x: pos.x, y: pos.y + i * 5 });
      await page.waitForTimeout(10);
    }

    await pointerUp(page, { x: pos.x, y: pos.y + 25 });
    await page.waitForTimeout(50);

    const indicator = page.locator('[data-testid="drop-indicator"]');
    await expect(indicator).not.toBeVisible();
  });
});
