import { test, expect } from '@playwright/test';
test('stability check', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('[data-block-type="brush"]');
  await page.waitForTimeout(1000);  // let animations settle
  
  const result = await page.evaluate(async () => {
    const el = document.querySelector('[data-block-type="brush"]');
    if (!el) return { error: 'not found' };
    const rects = [];
    for (let i = 0; i < 30; i++) {
      await new Promise(r => requestAnimationFrame(r));
      const rect = el.getBoundingClientRect();
      rects.push([i, rect.x, rect.y, rect.width, rect.height]);
    }
    return rects;
  });
  
  console.log('STABILITY DATA:', JSON.stringify(result));
});
