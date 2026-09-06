import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('http://localhost:3030');
await page.waitForSelector('[data-block-type="brush"]');

// Check bounding box stability over multiple frames  
const results = await page.evaluate(async () => {
  const el = document.querySelector('[data-block-type="brush"]');
  if (!el) return { error: 'Element not found' };
  
  const rects = [];
  for (let i = 0; i < 20; i++) {
    await new Promise(r => requestAnimationFrame(r));
    const rect = el.getBoundingClientRect();
    rects.push({ frame: i, x: rect.x, y: rect.y, w: rect.width, h: rect.height });
  }
  return rects;
});

console.log('Bounding box over 20 frames:');
for (const r of results) {
  console.log(`  Frame ${r.frame}: x=${r.x.toFixed(2)} y=${r.y.toFixed(2)} w=${r.w.toFixed(2)} h=${r.h.toFixed(2)}`);
}

// Check if any values changed
const first = results[0];
const changed = results.some(r => r.x !== first.x || r.y !== first.y || r.w !== first.w || r.h !== first.h);
console.log(`\nBounding box changed: ${changed}`);

await browser.close();
