import { expect, test } from '@playwright/test';
import { countAnimatingElements, getAnimations, getComputedTransform, getRect, waitForAnimations } from './helpers';

// ============================================================================
// MARK: Setup
// ============================================================================

test.beforeEach(async ({ page }) => {
  await page.goto('/#flip');
  await expect(page.locator('[data-fixture="flip"]')).toBeVisible();
});

// ============================================================================
// MARK: FLIP animation — basic behavior
// ============================================================================

test.describe('FLIP animation basics', () => {
  test('items render in initial order', async ({ page }) => {
    const order = await page.locator('[data-testid="item-order"]').textContent();
    expect(order).toBe('a,b,c,d,e');
  });

  test('clicking "Move first → end" reorders items', async ({ page }) => {
    await page.locator('[data-action="move-first-to-end"]').click();
    // Wait for FLIP to finish
    await waitForAnimations(page, '[data-item-id]');
    const order = await page.locator('[data-testid="item-order"]').textContent();
    expect(order).toBe('b,c,d,e,a');
  });

  test('clicking "Reverse" reverses items', async ({ page }) => {
    await page.locator('[data-action="reverse"]').click();
    await waitForAnimations(page, '[data-item-id]');
    const order = await page.locator('[data-testid="item-order"]').textContent();
    expect(order).toBe('e,d,c,b,a');
  });
});

// ============================================================================
// MARK: FLIP animation — Web Animations API assertions
// ============================================================================

test.describe('FLIP animation — real browser animations', () => {
  test('elements have running Web Animations immediately after reorder', async ({ page }) => {
    // Capture initial positions
    const posA_before = await getRect(page, '[data-item-id="a"]');
    expect(posA_before).toBeTruthy();

    // Trigger reorder — click and immediately check for animations
    await page.locator('[data-action="move-first-to-end"]').click();

    // Small delay to let SolidJS update DOM + FLIP start
    await page.waitForTimeout(30);

    // Items that moved should have running animations
    const animCount = await countAnimatingElements(page, '[data-item-id]');
    expect(animCount).toBeGreaterThan(0);
  });

  test('FLIP animation keyframes use translate transforms', async ({ page }) => {
    await page.locator('[data-action="move-first-to-end"]').click();
    await page.waitForTimeout(30);

    // Check animation keyframes on item B (moves from y=~50 to y=~0, so translate(0px, 50px) → translate(0,0))
    const anims = await getAnimations(page, '[data-item-id="b"]');
    expect(anims.length).toBeGreaterThan(0);
    expect(anims[0].playState).toBe('running');

    // Keyframes should contain translate transforms
    const kfs = anims[0].keyframes;
    expect(kfs.length).toBe(2);
    expect(kfs[0].transform).toMatch(/translate\(/);
    expect(kfs[1].transform).toMatch(/translate\(0/);
  });

  test('computed transform is not "none" during animation', async ({ page }) => {
    await page.locator('[data-action="reverse"]').click();
    await page.waitForTimeout(30);

    // Item A was at top, now at bottom — should have a non-identity transform
    const transform = await getComputedTransform(page, '[data-item-id="a"]');
    // During animation, the computed transform is a matrix(...) not 'none'
    expect(transform).not.toBe('none');
  });

  test('computed transform returns to "none" after animation completes', async ({ page }) => {
    await page.locator('[data-action="move-first-to-end"]').click();
    await waitForAnimations(page, '[data-item-id]');

    // After completion, all elements should have identity transform
    for (const id of ['a', 'b', 'c', 'd', 'e']) {
      const transform = await getComputedTransform(page, `[data-item-id="${id}"]`);
      expect(transform).toBe('none');
    }
  });

  test('items that did not move have no animations', async ({ page }) => {
    // "Swap first two": only items A and B should animate, C/D/E stay
    await page.locator('[data-action="swap-first-two"]').click();
    await page.waitForTimeout(30);

    const animsA = await getAnimations(page, '[data-item-id="a"]');
    const animsB = await getAnimations(page, '[data-item-id="b"]');
    const animsC = await getAnimations(page, '[data-item-id="c"]');
    const animsD = await getAnimations(page, '[data-item-id="d"]');
    const animsE = await getAnimations(page, '[data-item-id="e"]');

    // A and B should be animating
    expect(animsA.length).toBeGreaterThan(0);
    expect(animsB.length).toBeGreaterThan(0);

    // C, D, E should not have animations
    expect(animsC.length).toBe(0);
    expect(animsD.length).toBe(0);
    expect(animsE.length).toBe(0);
  });
});

// ============================================================================
// MARK: FLIP animation — position correctness
// ============================================================================

test.describe('FLIP animation — position correctness', () => {
  test('items end up at correct positions after "Move first → end"', async ({ page }) => {
    // Capture all Y positions before reorder
    const yBefore: Record<string, number> = {};
    for (const id of ['a', 'b', 'c', 'd', 'e']) {
      const rect = await getRect(page, `[data-item-id="${id}"]`);
      yBefore[id] = rect!.y;
    }

    await page.locator('[data-action="move-first-to-end"]').click();
    await waitForAnimations(page, '[data-item-id]');

    // After animation: B should be where A was, C where B was, etc.
    const yAfter: Record<string, number> = {};
    for (const id of ['a', 'b', 'c', 'd', 'e']) {
      const rect = await getRect(page, `[data-item-id="${id}"]`);
      yAfter[id] = rect!.y;
    }

    // B is now first → should be at A's old position
    expect(yAfter['b']).toBeCloseTo(yBefore['a'], 0);
    // A is now last → should be at E's old position
    expect(yAfter['a']).toBeCloseTo(yBefore['e'], 0);
  });

  test('items end up at correct positions after "Reverse"', async ({ page }) => {
    const yBefore: Record<string, number> = {};
    for (const id of ['a', 'b', 'c', 'd', 'e']) {
      const rect = await getRect(page, `[data-item-id="${id}"]`);
      yBefore[id] = rect!.y;
    }

    await page.locator('[data-action="reverse"]').click();
    await waitForAnimations(page, '[data-item-id]');

    const yAfter: Record<string, number> = {};
    for (const id of ['a', 'b', 'c', 'd', 'e']) {
      const rect = await getRect(page, `[data-item-id="${id}"]`);
      yAfter[id] = rect!.y;
    }

    // E should now be at A's old position, D at B's, etc.
    expect(yAfter['e']).toBeCloseTo(yBefore['a'], 0);
    expect(yAfter['d']).toBeCloseTo(yBefore['b'], 0);
    expect(yAfter['c']).toBeCloseTo(yBefore['c'], 0); // middle stays
    expect(yAfter['b']).toBeCloseTo(yBefore['d'], 0);
    expect(yAfter['a']).toBeCloseTo(yBefore['e'], 0);
  });
});

// ============================================================================
// MARK: FLIP animation — isAnimating state
// ============================================================================

test.describe('FLIP animation — isAnimating signal', () => {
  test('isAnimating is false initially', async ({ page }) => {
    const text = await page.locator('[data-testid="is-animating"]').textContent();
    expect(text).toBe('false');
  });

  test('isAnimating becomes true during animation', async ({ page }) => {
    await page.locator('[data-action="move-first-to-end"]').click();
    await page.waitForTimeout(30);

    const text = await page.locator('[data-testid="is-animating"]').textContent();
    expect(text).toBe('true');
  });

  test('isAnimating returns to false after animation completes', async ({ page }) => {
    await page.locator('[data-action="move-first-to-end"]').click();
    await waitForAnimations(page, '[data-item-id]');

    // Small extra wait for the Promise.all → setIsAnimating(false) chain
    await page.waitForTimeout(50);

    const text = await page.locator('[data-testid="is-animating"]').textContent();
    expect(text).toBe('false');
  });
});

// ============================================================================
// MARK: FLIP animation — rapid consecutive triggers
// ============================================================================

test.describe('FLIP animation — rapid triggers', () => {
  test('rapid clicks cancel previous animations and play new ones', async ({ page }) => {
    // Click twice quickly — second should cancel first
    await page.locator('[data-action="move-first-to-end"]').click();
    await page.waitForTimeout(50); // mid-animation
    await page.locator('[data-action="move-first-to-end"]').click();

    await waitForAnimations(page, '[data-item-id]');
    await page.waitForTimeout(50);

    // Final order should reflect two "move first to end" operations
    const order = await page.locator('[data-testid="item-order"]').textContent();
    expect(order).toBe('c,d,e,a,b');
  });

  test('no transform residue after rapid clicks', async ({ page }) => {
    // Three rapid clicks
    await page.locator('[data-action="move-first-to-end"]').click();
    await page.waitForTimeout(30);
    await page.locator('[data-action="move-first-to-end"]').click();
    await page.waitForTimeout(30);
    await page.locator('[data-action="move-first-to-end"]').click();

    await waitForAnimations(page, '[data-item-id]');
    await page.waitForTimeout(50);

    // All transforms should be cleared
    for (const id of ['a', 'b', 'c', 'd', 'e']) {
      const transform = await getComputedTransform(page, `[data-item-id="${id}"]`);
      expect(transform).toBe('none');
    }
  });
});
