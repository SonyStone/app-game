import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';

// Run against `pnpm --filter @app-game/gpu-text-rendering dev`. Checks the shared Resizable with any number of panels.
const baseURL = process.env.GPU_TEXT_URL ?? 'http://localhost:3180';
const browser = await chromium.launch({ channel: process.env.GPU_TEXT_BROWSER_CHANNEL || undefined, headless: true });
const page = await browser.newPage({ viewport: { width: 1208, height: 808 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));

try {
  for (const orientation of ['horizontal', 'vertical']) {
    for (const count of [2, 3, 4]) {
      await page.goto(`${baseURL}/tests/browser/empty.html`);
      await page.evaluate(
        async ({ count, orientation }) =>
          (await import('/tests/browser/resizableHarness.tsx')).mountPanels(count, orientation),
        { count, orientation }
      );
      const label = `${count} ${orientation} panels`;
      const vertical = orientation === 'vertical';
      const sizes = () =>
        page.evaluate(
          ({ count, vertical }) =>
            Array.from({ length: count }, (_, index) => {
              const rect = document.querySelector(`[data-testid=panel-${index}]`).getBoundingClientRect();
              return Math.round(vertical ? rect.height : rect.width);
            }),
          { count, vertical }
        );

      const equal = await sizes();
      assert.ok(Math.max(...equal) - Math.min(...equal) <= 1, `${label} start equal`);

      for (let handle = 1; handle < count; handle++) {
        const before = await sizes();
        const box = await page.getByTestId(`handle-${handle}`).boundingBox();
        const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(vertical ? x : x + 40, vertical ? y + 40 : y, { steps: 4 });
        await page.mouse.up();
        const after = await sizes();

        after.forEach((size, index) => {
          const expected =
            index === handle - 1 ? before[index] + 40 : index === handle ? before[index] - 40 : before[index];
          assert.ok(Math.abs(size - expected) <= 1, `${label}: dragging handle ${handle} changes only its neighbours`);
        });
      }

      const before = await sizes();
      await page.getByTestId('handle-1').focus();
      await page.keyboard.press(vertical ? 'ArrowDown' : 'ArrowRight');
      const step = Math.round(0.05 * (vertical ? 808 : 1208));
      const after = await sizes();
      assert.ok(Math.abs(after[0] - before[0] - step) <= 1, `${label}: an arrow key moves 5%`);
      assert.ok(
        after.slice(2).every((size, index) => Math.abs(size - before[index + 2]) <= 1),
        `${label}: keys keep others`
      );

      await page.keyboard.press('Home');
      const minimum = Math.round(0.1 * (vertical ? 808 : 1208));
      assert.ok(Math.abs((await sizes())[0] - minimum) <= 1, `${label}: Home stops at the minimum size`);
    }
  }

  assert.deepEqual(errors, []);
  console.log('PASS resizable: 2–4 panels, both orientations, drag, keys and minimum sizes');
} finally {
  await browser.close();
}
