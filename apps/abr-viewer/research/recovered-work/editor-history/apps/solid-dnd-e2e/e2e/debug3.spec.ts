import { test } from '@playwright/test';

test('mouse.click works', async ({ page }) => {
  await page.setContent('<html><body><h1>Test</h1></body></html>');
  console.log('click 1');
  await page.mouse.click(50, 50);
  console.log('click 2');
  await page.mouse.click(100, 100);
  console.log('done');
});

test('mouse.move with steps:0', async ({ page }) => {
  await page.setContent('<html><body><h1>Test</h1></body></html>');
  console.log('move 1');
  await page.mouse.move(50, 50, { steps: 0 });
  console.log('move 2');
  await page.mouse.move(100, 100, { steps: 0 });
  console.log('move 3');
  await page.mouse.move(150, 150, { steps: 0 });
  console.log('done');
});

test('mouse.move with steps:5', async ({ page }) => {
  await page.setContent('<html><body><h1>Test</h1></body></html>');
  console.log('move 1');
  await page.mouse.move(50, 50, { steps: 5 });
  console.log('move 2');
  await page.mouse.move(100, 100, { steps: 5 });
  console.log('done');
});

test('mouse.down then mouse.move', async ({ page }) => {
  await page.setContent('<html><body><h1>Test</h1></body></html>');
  await page.mouse.move(50, 50);
  await page.mouse.down();
  console.log('down done, trying move...');
  await page.mouse.move(100, 100);
  console.log('move done');
  await page.mouse.up();
  console.log('all done');
});

test('CDP dispatchMouseEvent directly', async ({ page }) => {
  await page.setContent('<html><body><h1>Test</h1></body></html>');

  const cdp = await page.context().newCDPSession(page);

  console.log('CDP move 1');
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: 50,
    y: 50,
  });
  console.log('CDP move 2');
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: 100,
    y: 100,
  });
  console.log('CDP move 3');
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: 150,
    y: 150,
  });
  console.log('All CDP moves done');
});
