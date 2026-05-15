import { Locator, Page } from '@playwright/test';

// ============================================================================
// MARK: Pointer event helpers
// ============================================================================
// Uses the real CDP page.mouse API which triggers actual browser PointerEvents.
// This is necessary because createDragSensor uses setPointerCapture(), which
// only works with real browser-generated pointer events (not synthetic ones
// created via dispatchEvent).

/**
 * Move the mouse to the given position and press the left button.
 */
export async function pointerDown(page: Page, _el: Locator, pos: { x: number; y: number }) {
  await page.mouse.move(pos.x, pos.y);
  await page.mouse.down();
}

/**
 * Move the mouse to a new position (triggers pointermove).
 */
export async function pointerMove(page: Page, pos: { x: number; y: number }) {
  await page.mouse.move(pos.x, pos.y);
}

/**
 * Release the mouse button at the given position.
 */
export async function pointerUp(page: Page, pos: { x: number; y: number }) {
  await page.mouse.move(pos.x, pos.y);
  await page.mouse.up();
}

/**
 * Simulates a full drag sequence with incremental steps.
 */
export async function drag(
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

/**
 * Returns the center of a locator's bounding box.
 */
export async function center(loc: Locator) {
  const box = await loc.boundingBox();
  if (!box) throw new Error('Element not found');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

// ============================================================================
// MARK: Animation query helpers
// ============================================================================

/**
 * Get running Web Animations on an element via `element.getAnimations()`.
 * Returns info about each animation's play state and keyframes.
 */
export async function getAnimations(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return [];
    const anims = el.getAnimations();
    return anims.map((a) => ({
      playState: a.playState,
      currentTime: a.currentTime,
      keyframes: (a.effect as KeyframeEffect)?.getKeyframes?.() ?? []
    }));
  }, selector);
}

/**
 * Get the computed transform of an element.
 */
export async function getComputedTransform(page: Page, selector: string): Promise<string> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return 'none';
    return getComputedStyle(el).transform;
  }, selector);
}

/**
 * Get the bounding rect of an element.
 */
export async function getRect(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }, selector);
}

/**
 * Wait for all Web Animations on matching elements to finish.
 */
export async function waitForAnimations(page: Page, selector: string, timeout = 2000) {
  await page.evaluate(
    async ({ sel, timeout }) => {
      const els = document.querySelectorAll(sel);
      const promises: Promise<Animation>[] = [];
      for (const el of els) {
        for (const anim of el.getAnimations()) {
          promises.push(anim.finished);
        }
      }
      if (promises.length > 0) {
        await Promise.race([Promise.all(promises), new Promise((r) => setTimeout(r, timeout))]);
      }
    },
    { sel: selector, timeout }
  );
}

/**
 * Count how many elements matching a selector currently have running animations.
 */
export async function countAnimatingElements(page: Page, selector: string): Promise<number> {
  return page.evaluate((sel) => {
    const els = document.querySelectorAll(sel);
    let count = 0;
    for (const el of els) {
      if (el.getAnimations().some((a) => a.playState === 'running')) count++;
    }
    return count;
  }, selector);
}
