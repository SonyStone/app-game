import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { installHarness } from './browserHarness.mjs';

// Capture one external GDOC page at several sizes for independent PDF-reference comparison.
const input = process.argv[2];
assert.ok(input, 'Usage: node tests/compatibility/coverage.browser.mjs /absolute/document.gdoc');
const output = process.env.GPU_TEXT_OUTPUT ?? '/tmp/gpu-pdf-coverage';
const pageIndex = Number(process.env.GPU_TEXT_PAGE ?? 1) - 1;
assert.ok(Number.isInteger(pageIndex) && pageIndex >= 0, 'GPU_TEXT_PAGE must be a positive page number');
const baseURL = process.env.GPU_TEXT_URL ?? 'http://localhost:3180';
await mkdir(output, { recursive: true });
const bytes = await readFile(input);
const server = createServer((request, response) => {
  response.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/octet-stream' });
  response.end(bytes);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    args: ['--enable-unsafe-webgpu', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])]
  });
  const context = await browser.newContext({ viewport: { width: 800, height: 800 } });
  await context.grantPermissions(['local-network-access'], { origin: new URL(baseURL).origin });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/coverage-page-check', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<body style="margin:0"></body>'
    })
  );
  await page.goto(`${baseURL}/coverage-page-check`);
  await page.evaluate(installHarness);
  const prepared = await page.evaluate(
    (url) => compatibility.prepare(url),
    `http://127.0.0.1:${server.address().port}/input.gdoc`
  );
  assert.ok(prepared.ok, JSON.stringify(prepared));
  const target = prepared.pages[pageIndex];
  assert.ok(target, 'Requested page is outside the document');
  const captures = [];
  for (const width of [64, 128, 256]) {
    const height = Math.round((width * target.height) / target.width);
    const result = await page.evaluate(({ pageIndex, width, height }) => compatibility.draw(pageIndex, width, height), {
      pageIndex,
      width,
      height
    });
    assert.ok(result.ok, JSON.stringify(result));
    await page.locator('canvas').screenshot({ path: path.join(output, `area-${width}.png`) });
    captures.push({ width, height });
  }
  await page.evaluate(() => compatibility.dispose());
  assert.deepEqual(errors, []);
  const report = { input, page: pageIndex + 1, captures, resourceBytes: prepared.resourceBytes };
  await writeFile(path.join(output, 'capture.json'), JSON.stringify(report, null, 2));
  console.log(report);
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
