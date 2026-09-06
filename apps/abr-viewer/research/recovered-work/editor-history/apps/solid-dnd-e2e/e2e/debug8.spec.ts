import { test, expect } from '@playwright/test';

// Test 1: Navigate to the actual app and try mouse.move
test('app page: 2 moves', async ({ page }) => {
  await page.goto('/#drag');
  await expect(page.locator('[data-fixture="drag"]')).toBeVisible();
  console.log('move 1');
  await page.mouse.move(50, 50);
  console.log('move 2');
  await page.mouse.move(100, 100);
  console.log('done');
});

// Test 2: Same but 3 moves
test('app page: 3 moves', async ({ page }) => {
  await page.goto('/#drag');
  await expect(page.locator('[data-fixture="drag"]')).toBeVisible();
  console.log('move 1');
  await page.mouse.move(50, 50);
  console.log('move 2');
  await page.mouse.move(100, 100);
  console.log('move 3');
  await page.mouse.move(150, 150);
  console.log('done');
});

// Test 3: setContent, 3 moves
test('setContent: 3 moves', async ({ page }) => {
  await page.setContent('<html><body><h1>Test</h1></body></html>');
  console.log('move 1');
  await page.mouse.move(50, 50);
  console.log('move 2');
  await page.mouse.move(100, 100);
  console.log('move 3');
  await page.mouse.move(150, 150);
  console.log('done');
});

// Test 4: setContent, 5 moves quickly
test('setContent: 5 moves quickly', async ({ page }) => {
  await page.setContent('<html><body><h1>Test</h1></body></html>');
  for (let i = 0; i < 5; i++) {
    await page.mouse.move(50 + i * 10, 50 + i * 10);
  }
  console.log('done');
});

// Test 5: setContent, 2 moves with delay
test('setContent: 2 moves with 500ms delay', async ({ page }) => {
  await page.setContent('<html><body><h1>Test</h1></body></html>');
  console.log('move 1');
  await page.mouse.move(50, 50);
  await page.waitForTimeout(500);
  console.log('move 2');
  await page.mouse.move(100, 100);
  console.log('done');
});
