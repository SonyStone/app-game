import { chromium } from '@playwright/test';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on('console', (msg) => console.log('console:', msg.type(), msg.text()));
page.on('pageerror', (err) => console.log('pageerror:', err.stack || err.message));
page.on('crash', () => console.log('page crashed'));

await page.goto('http://localhost:3040/sortable-overlay');
await page.waitForSelector('[data-testid="sortable-overlay-demo"]');
const first = page.locator('[role="listbox"] [role="option"]').nth(0);
const box = await first.boundingBox();
console.log('box', box);
const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
console.log('from', from);
await page.mouse.move(from.x, from.y);
await page.mouse.down();
console.log('down ok');
await page.waitForTimeout(50);
try {
  await page.mouse.move(from.x, from.y + 20, { steps: 1, timeout: 5000 });
  console.log('move1 ok');
} catch (error) {
  console.log('move1 failed', error.message);
}
try {
  await page.screenshot({ path: '/tmp/chromium-dnd-debug.png', fullPage: true });
  console.log('screenshot ok');
} catch (error) {
  console.log('screenshot failed', error.message);
}
console.log('isDragging text', await page.getByTestId('sortable-overlay-is-dragging').textContent());
await browser.close();
