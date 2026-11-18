import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/** Checks the main LEGO entry, host controls and shared Classic drawing on isolated dev servers. */
const paint = process.env.PAINT_URL;
const web = process.env.WEB_URL;
assert.ok(paint && web, 'Set PAINT_URL and WEB_URL to isolated dev servers');
const output = path.join(os.tmpdir(), 'paint-main-lego');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--enable-unsafe-webgpu', '--use-angle=metal']
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${paint}/variants.html#studio`);
  await saved(page);
  await page.getByRole('button', { name: 'Drawing menu', exact: true }).waitFor();
  await page.mouse.move(550, 430);
  await page.mouse.down();
  await page.mouse.move(750, 430, { steps: 20 });
  await page.mouse.up();
  await saved(page);
  await inked(page, 650, 430);
  await page.screenshot({ path: path.join(output, 'classic-stroke.png') });
  console.log('PASS Classic stroke saved');
  await page.goto(paint);
  await legoReady(page);
  console.log('PASS LEGO ready');
  await page.getByRole('button', { name: 'Edit', exact: true }).waitFor();
  await inked(page, 650, 430);
  await page.screenshot({ path: path.join(output, 'main-shared-stroke.png') });
  await page.locator('[data-part-kind="action:file"] button').first().click();
  await page.getByRole('group', { name: 'Paint app' }).waitFor();
  await page.getByLabel('App version').waitFor();
  await page.screenshot({ path: path.join(output, 'main-file-app.png') });
  for (const route of ['/paint', '/paint/lego', '/paint/studio']) {
    console.log('Checking', route);
    await page.goto(`${web}${route}`);
    if (route === '/paint/studio') {
      await saved(page);
      await page.getByRole('button', { name: 'Drawing menu', exact: true }).waitFor();
    } else {
      await legoReady(page);
      await page.getByRole('button', { name: 'Edit', exact: true }).waitFor();
      await page.locator('[data-part-kind="action:file"] button').first().click();
      await page.getByRole('menu', { name: 'File', exact: true }).waitFor();
      assert.equal(await page.getByRole('group', { name: 'Paint app' }).count(), 0);
    }
    await page.screenshot({ path: path.join(output, `${route.slice(1).replaceAll('/', '-')}.png`) });
  }
  assert.deepEqual(errors, []);
  console.log(`PASS main entry, shared saved stroke, File app group, website routes. Screenshots: ${output}`);
} finally {
  await browser.close();
}

/** Waits for the document engine and its persistent save to settle. */
function saved(page) {
  return page
    .getByRole('status')
    .filter({ hasText: /^Saved$/ })
    .waitFor({ timeout: 60_000 });
}

/** Reads a canvas pixel through a screenshot, including WebGPU output. */
async function inked(page, x, y) {
  const shot = await page.screenshot({ clip: { x: x - 1, y: y - 1, width: 3, height: 3 } });
  const pixel = await page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = new OffscreenCanvas(3, 3);
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    return [...context.getImageData(1, 1, 1, 1).data];
  }, shot.toString('base64'));
  assert.ok(Math.max(...pixel.slice(0, 3)) < 160, `Expected ink at ${x}, ${y}; got ${pixel}`);
}

/** File commands become enabled only when the LEGO document engine is ready. */
async function legoReady(page) {
  await page.locator('[data-part-kind="action:file"] button').first().click();
  await page.getByRole('menuitem', { name: /Save drawing/ }).waitFor();
  await page.waitForFunction(() => !document.querySelector('[role="menuitem"][disabled]'), undefined, {
    timeout: 30_000
  });
  await page.keyboard.press('Escape');
}
