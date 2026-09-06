const { test } = require('@playwright/test');

test('debug sortable overlay', async ({ page }) => {
  await page.goto('http://127.0.0.1:3040/sortable-overlay');
  await page.waitForLoadState('networkidle');

  const first = page.getByRole('option').first();
  const box = await first.boundingBox();
  console.log('firstBox', box);

  const statesBefore = await page.locator('text=isDragging').locator('..').allTextContents().catch(() => []);
  console.log('statesBefore', statesBefore);

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 20, { steps: 5 });

  const overlayInfo = await page.evaluate(() => {
    const overlays = [...document.querySelectorAll('.pointer-events-none.fixed')].map((el) => ({
      className: el.className,
      text: el.textContent,
      rect: el.getBoundingClientRect().toJSON?.() ?? null,
    }));
    return {
      overlays,
      body: document.body.textContent,
    };
  });
  console.log('overlayInfo', JSON.stringify(overlayInfo));

  await page.mouse.up();
});
