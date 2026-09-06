import { test, expect, chromium, firefox } from '@playwright/test';

// Test 1: Default Playwright (chromium-headless-shell) — the one that's broken
test('default chromium: three mouse.moves', async ({ page }) => {
  await page.setContent('<div style="width:300px;height:300px;background:red;">box</div>');
  await page.mouse.move(50, 50);
  await page.mouse.move(100, 100);
  await page.mouse.move(150, 150);
  expect(true).toBe(true);
});

// Test 2: Launch full Chromium explicitly (not headless-shell)
test('full chromium (headless new): three mouse.moves', async () => {
  const browser = await chromium.launch({
    headless: true,
    channel: undefined,
    executablePath: undefined,
    args: [
      '--headless=new',       // force "new headless" mode on full chromium
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-sandbox',
    ],
  });
  const page = await browser.newPage();
  await page.setContent('<div style="width:300px;height:300px;background:red;">box</div>');
  try {
    await page.mouse.move(50, 50);
    await page.mouse.move(100, 100);
    await page.mouse.move(150, 150);
    expect(true).toBe(true);
  } finally {
    await browser.close();
  }
});

// Test 3: Firefox
test('firefox: three mouse.moves', async () => {
  const browser = await firefox.launch({ headless: true });
  const page = await browser.newPage();
  await page.setContent('<div style="width:300px;height:300px;background:red;">box</div>');
  try {
    await page.mouse.move(50, 50);
    await page.mouse.move(100, 100);
    await page.mouse.move(150, 150);
    expect(true).toBe(true);
  } finally {
    await browser.close();
  }
});

// Test 4: Firefox full drag sequence
test('firefox: full drag sequence', async () => {
  const browser = await firefox.launch({ headless: true });
  const page = await browser.newPage();
  await page.setContent('<div style="width:300px;height:300px;background:red;">box</div>');
  try {
    await page.mouse.move(50, 50);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(50 + i * 10, 50 + i * 10);
    }
    await page.mouse.up();
    expect(true).toBe(true);
  } finally {
    await browser.close();
  }
});

// Test 5: Full Chromium drag sequence
test('full chromium: full drag sequence', async () => {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--headless=new',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-sandbox',
    ],
  });
  const page = await browser.newPage();
  await page.setContent('<div style="width:300px;height:300px;background:red;">box</div>');
  try {
    await page.mouse.move(50, 50);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(50 + i * 10, 50 + i * 10);
    }
    await page.mouse.up();
    expect(true).toBe(true);
  } finally {
    await browser.close();
  }
});
