import { expect, test, type Locator, type Page } from '@playwright/test';
import { center, pointerDown, pointerMove, pointerUp } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/sortable-overlay');
  await expect(page.getByTestId('sortable-overlay-demo')).toBeVisible();
});

function items(page: Page): Locator {
  return page.locator('[role="listbox"] [role="option"]');
}

async function visibleOrder(page: Page): Promise<string[]> {
  return items(page).evaluateAll((elements) =>
    elements
      .map((element) => element.textContent ?? '')
      .map((text) => {
        const match = text.match(/(\d+)\s*$/);
        return match?.[1] ?? text.trim();
      })
  );
}

async function startDrag(page: Page, item: Locator, delta: { x: number; y: number }): Promise<void> {
  const from = await center(item);
  await pointerDown(page, item, from);
  await page.waitForTimeout(20);

  for (let step = 1; step <= 6; step++) {
    await pointerMove(page, {
      x: from.x + (delta.x * step) / 6,
      y: from.y + (delta.y * step) / 6
    });
    await page.waitForTimeout(16);
  }
}

test('vertical drag shows gap and drop place, then reorders on drop', async ({ page }) => {
  const first = items(page).nth(0);

  await startDrag(page, first, { x: 0, y: 80 });

  await expect(page.getByTestId('sortable-overlay-is-dragging')).toContainText('true');
  await expect(page.getByTestId('sortable-overlay-drag-overlay')).toBeVisible();
  await expect(page.getByTestId('sortable-overlay-gap')).toBeVisible();
  await expect(page.getByTestId('sortable-overlay-drop-place')).not.toContainText('none');

  const from = await center(first);
  await pointerUp(page, { x: from.x, y: from.y + 80 });
  await page.waitForTimeout(250);

  await expect(page.getByTestId('sortable-overlay-is-dragging')).toContainText('false');
  const order = await visibleOrder(page);
  expect(order).not.toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
  expect(order).toHaveLength(8);
  expect(order[0]).not.toBe('1');
});

test('horizontal drag resolves a drop place', async ({ page }) => {
  await page.getByRole('button', { name: 'Horizontal' }).click();
  await expect(page.getByTestId('sortable-overlay-list')).toHaveAttribute('aria-label', 'Sortable horizontal');

  const first = items(page).nth(0);
  await startDrag(page, first, { x: 120, y: 0 });

  await expect(page.getByTestId('sortable-overlay-gap')).toBeVisible();
  await expect(page.getByTestId('sortable-overlay-drop-place')).not.toContainText('none');

  const from = await center(first);
  await pointerUp(page, { x: from.x + 120, y: from.y });
});

test('grid drag resolves a drop place', async ({ page }) => {
  await page.getByRole('button', { name: 'Grid' }).click();
  await expect(page.getByTestId('sortable-overlay-list')).toHaveAttribute('aria-label', 'Sortable grid');

  const first = items(page).nth(0);
  await startDrag(page, first, { x: 140, y: 80 });

  await expect(page.getByTestId('sortable-overlay-gap')).toBeVisible();
  await expect(page.getByTestId('sortable-overlay-drop-place')).not.toContainText('none');

  const from = await center(first);
  await pointerUp(page, { x: from.x + 140, y: from.y + 80 });
});

test('flip debug overlay appears during drag when enabled', async ({ page }) => {
  await page.getByLabel('FLIP debug').check();

  const first = items(page).nth(0);
  await startDrag(page, first, { x: 0, y: 80 });

  await expect(page.getByRole('button', { name: 'Copy Debug' })).toBeVisible();
  await expect(page.locator('svg.pointer-events-none.fixed.inset-0')).toBeVisible();

  const from = await center(first);
  await pointerUp(page, { x: from.x, y: from.y + 80 });
});
