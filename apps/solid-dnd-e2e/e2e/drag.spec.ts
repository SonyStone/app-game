import { expect, test } from '@playwright/test';
import { center, pointerDown, pointerMove, pointerUp } from './helpers';

// ============================================================================
// MARK: Setup
// ============================================================================

test.beforeEach(async ({ page }) => {
  await page.goto('/#drag');
  await expect(page.locator('[data-fixture="drag"]')).toBeVisible();
});

// ============================================================================
// MARK: Drag sensor — click detection
// ============================================================================

test.describe('Drag sensor — click', () => {
  test('tap without moving fires click, not drag', async ({ page }) => {
    const handle = page.locator('[data-testid="drag-handle"]');
    const pos = await center(handle);

    await pointerDown(page, handle, pos);
    await page.waitForTimeout(20);
    await pointerUp(page, pos);

    const event = await page.locator('[data-testid="last-event"]').textContent();
    expect(event).toBe('click');

    const dragging = await page.locator('[data-testid="is-dragging"]').textContent();
    expect(dragging).toBe('false');
  });

  test('small movement under threshold fires click', async ({ page }) => {
    const handle = page.locator('[data-testid="drag-handle"]');
    const pos = await center(handle);

    await pointerDown(page, handle, pos);
    await page.waitForTimeout(10);
    // Move only 3px — well under the 8px threshold
    await pointerMove(page, { x: pos.x + 2, y: pos.y + 2 });
    await page.waitForTimeout(10);
    await pointerUp(page, { x: pos.x + 2, y: pos.y + 2 });

    const event = await page.locator('[data-testid="last-event"]').textContent();
    expect(event).toBe('click');
  });
});

// ============================================================================
// MARK: Drag sensor — drag detection
// ============================================================================

test.describe('Drag sensor — drag', () => {
  test('moving past threshold triggers drag', async ({ page }) => {
    const handle = page.locator('[data-testid="drag-handle"]');
    const pos = await center(handle);

    await pointerDown(page, handle, pos);
    await page.waitForTimeout(10);

    // Move past the 8px threshold
    for (let i = 1; i <= 5; i++) {
      await pointerMove(page, { x: pos.x, y: pos.y + i * 5 });
      await page.waitForTimeout(10);
    }

    const dragging = await page.locator('[data-testid="is-dragging"]').textContent();
    expect(dragging).toBe('true');

    const event = await page.locator('[data-testid="last-event"]').textContent();
    expect(event).toMatch(/^drag-start:/);

    await pointerUp(page, { x: pos.x, y: pos.y + 25 });
  });

  test('isDragging becomes false after pointerup', async ({ page }) => {
    const handle = page.locator('[data-testid="drag-handle"]');
    const pos = await center(handle);

    await pointerDown(page, handle, pos);
    await page.waitForTimeout(10);

    for (let i = 1; i <= 5; i++) {
      await pointerMove(page, { x: pos.x, y: pos.y + i * 5 });
      await page.waitForTimeout(10);
    }

    expect(await page.locator('[data-testid="is-dragging"]').textContent()).toBe('true');

    await pointerUp(page, { x: pos.x, y: pos.y + 25 });
    await page.waitForTimeout(20);

    expect(await page.locator('[data-testid="is-dragging"]').textContent()).toBe('false');
  });

  test('drag-end event fires with correct delta', async ({ page }) => {
    const handle = page.locator('[data-testid="drag-handle"]');
    const pos = await center(handle);
    const targetY = pos.y + 100;

    await pointerDown(page, handle, pos);
    await page.waitForTimeout(10);

    for (let i = 1; i <= 10; i++) {
      const y = pos.y + (targetY - pos.y) * (i / 10);
      await pointerMove(page, { x: pos.x, y });
      await page.waitForTimeout(10);
    }

    await pointerUp(page, { x: pos.x, y: targetY });
    await page.waitForTimeout(20);

    const event = await page.locator('[data-testid="last-event"]').textContent();
    expect(event).toMatch(/^drag-end:/);
    // Delta should be approximately 0,100
    expect(event).toMatch(/drag-end:0,100/);
  });

  test('delta updates during drag', async ({ page }) => {
    const handle = page.locator('[data-testid="drag-handle"]');
    const pos = await center(handle);

    await pointerDown(page, handle, pos);
    await page.waitForTimeout(10);

    // Move past threshold
    for (let i = 1; i <= 5; i++) {
      await pointerMove(page, { x: pos.x, y: pos.y + i * 5 });
      await page.waitForTimeout(10);
    }

    // Now move further and check delta updates
    await pointerMove(page, { x: pos.x + 50, y: pos.y + 80 });
    await page.waitForTimeout(20);

    const delta = await page.locator('[data-testid="drag-delta"]').textContent();
    expect(delta).toBe('50,80');

    await pointerUp(page, { x: pos.x + 50, y: pos.y + 80 });
  });
});

// ============================================================================
// MARK: Drag sensor — cancel
// ============================================================================

test.describe('Drag sensor — cancel', () => {
  test('Escape key cancels active drag', async ({ page }) => {
    const handle = page.locator('[data-testid="drag-handle"]');
    const pos = await center(handle);

    await pointerDown(page, handle, pos);
    await page.waitForTimeout(10);

    for (let i = 1; i <= 5; i++) {
      await pointerMove(page, { x: pos.x, y: pos.y + i * 5 });
      await page.waitForTimeout(10);
    }

    expect(await page.locator('[data-testid="is-dragging"]').textContent()).toBe('true');

    await page.keyboard.press('Escape');
    await page.waitForTimeout(20);

    expect(await page.locator('[data-testid="is-dragging"]').textContent()).toBe('false');
    expect(await page.locator('[data-testid="last-event"]').textContent()).toBe('drag-cancel');
  });
});
