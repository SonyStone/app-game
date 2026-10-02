import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const samples = new URL('../../../packages/abr-parser/files/', import.meta.url);

test.use({ hasTouch: true });

test.beforeEach(async ({ page }) => {
  await page.goto('/abr-viewer');
  // Enough presets to overflow the collection, so swipes have something to scroll.
  await page
    .locator('input[type=file]')
    .setInputFiles(
      ['CGCookie_BasicBrushes.abr', 'MainBrushes.abr', 'Paint_markers_brush_set_by_LDN755.abr'].map((name) =>
        fileURLToPath(new URL(name, samples))
      )
    );
  // Previews mount after import and grow the cells; wait until the layout has settled into overflow.
  const collection = page.getByLabel('Brush collection', { exact: true });
  await expect
    .poll(() => collection.evaluate((element) => element.scrollHeight - element.clientHeight))
    .toBeGreaterThan(150);
});

test('mouse drops a preset exactly where the marker points in the wrapped grid', async ({ page }) => {
  const before = await brushOrder(page);
  const first = await box(page, 0);
  const third = await box(page, 2);
  await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
  await page.mouse.down();
  // Right half of the third cell means "after the third preset".
  await page.mouse.move(third.x + third.width * 0.75, third.y + third.height / 2, { steps: 8 });
  await expect(page.getByLabel('Brush collection', { exact: true }).locator('[class*=insertionMarker]')).toBeVisible();
  await page.mouse.up();

  await expect.poll(() => brushOrder(page)).toEqual([before[1], before[2], before[0], ...before.slice(3)]);
});

test('touch swipes scroll the collection without dragging presets', async ({ page }) => {
  const before = await brushOrder(page);
  const collection = page.getByLabel('Brush collection', { exact: true });
  const start = await box(page, 4);
  const touch = await touchscreen(page);
  await touch.start(start.x + start.width / 2, start.y + start.height / 2);
  for (let step = 1; step <= 10; step++) {
    await touch.move(start.x + start.width / 2, start.y + start.height / 2 - step * 25);
  }
  await touch.end();

  await expect.poll(() => collection.evaluate((element) => element.scrollTop)).toBeGreaterThan(50);
  expect(await brushOrder(page)).toEqual(before);
});

test('a touch long press drags a preset', async ({ page }) => {
  const before = await brushOrder(page);
  const first = await box(page, 0);
  const third = await box(page, 2);
  const touch = await touchscreen(page);
  await touch.start(first.x + first.width / 2, first.y + first.height / 2);
  await page.waitForTimeout(500);
  for (let step = 1; step <= 8; step++) {
    const t = step / 8;
    await touch.move(
      first.x + first.width / 2 + t * (third.x + third.width * 0.75 - first.x - first.width / 2),
      first.y + first.height / 2 + t * (third.y - first.y)
    );
  }
  await touch.end();

  await expect.poll(() => brushOrder(page)).toEqual([before[1], before[2], before[0], ...before.slice(3)]);
});

function brushOrder(page: Page) {
  return page.locator('[data-brush-id]').evaluateAll((elements) => elements.map((element) => element.ariaLabel));
}

async function box(page: Page, index: number) {
  const result = await page.locator('[data-brush-id]').nth(index).boundingBox();
  if (!result) throw new Error(`Preset ${index} is not rendered`);
  return result;
}

/** Raw CDP touches, so the browser decides between scrolling and pointer events as on a tablet. */
async function touchscreen(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  let last = { x: 0, y: 0 };
  const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', points: { x: number; y: number }[]) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  return {
    start: async (x: number, y: number) => send('touchStart', [(last = { x, y })]),
    move: async (x: number, y: number) => {
      await send('touchMove', [(last = { x, y })]);
      await page.waitForTimeout(16);
    },
    end: async () => send('touchEnd', [])
  };
}
