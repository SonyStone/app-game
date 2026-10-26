import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';

/** These contracts exercise the shared production renderer, including retouch pickup and idle build-up. */
test('all previews use Paint engine behavior', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/abr-viewer');
  const modulePath = `/@fs/${resolve('../../packages/paint-core/tests/preview.browser.ts')}`;
  const checks = await page.evaluate(async (path) => {
    const { verifyPreviewEngine } = await import(/* @vite-ignore */ path);
    return verifyPreviewEngine();
  }, modulePath);
  expect(checks.length).toBeGreaterThanOrEqual(25);
});
