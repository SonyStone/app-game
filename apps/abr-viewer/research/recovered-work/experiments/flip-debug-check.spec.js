const { test, expect } = require('@playwright/test');

test('flip debug overlay check', async ({ page }) => {
  await page.goto('http://127.0.0.1:3040/sortable-overlay');
  await page.waitForLoadState('networkidle');

  await page.getByLabel('FLIP debug').check();
  const first = page.locator('[role="listbox"] [role="option"]').first();
  const box = await first.boundingBox();
  console.log('firstBox', box);

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 80, { steps: 8 });
  await page.waitForTimeout(100);

  const snapshot = await page.evaluate(() => ({
    svgCount: document.querySelectorAll('svg.pointer-events-none.fixed.inset-0').length,
    copyButtons: [...document.querySelectorAll('button')].filter((el) => el.textContent?.includes('Copy Debug')).length,
    bodyText: document.body.textContent,
    html: document.body.innerHTML.slice(0, 5000)
  }));

  console.log(JSON.stringify(snapshot));
  await page.mouse.up();
});
