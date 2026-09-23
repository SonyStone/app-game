import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const url = process.env.GPU_TEXT_URL ?? 'http://127.0.0.1:3180';
const browser = await chromium.launch({
  channel: process.env.GPU_TEXT_BROWSER_CHANNEL || undefined,
  headless: true,
  args: ['--enable-unsafe-webgpu', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])]
});
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'ru-RU' });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (['warning', 'error'].includes(message.type())) errors.push(message.text());
  });
  await page.route('**/favicon.ico', (route) => route.fulfill({ status: 204 }));
  let loads = 0;
  page.on('request', (request) => {
    if (request.resourceType() === 'fetch' && request.url().includes('demo')) loads++;
  });
  await page.goto(`${url}/?keep=yes#pages`);
  await page.getByRole('button', { name: 'Show entire document', exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector('canvas').getAttribute('aria-busy') === 'false');
  const initialLoads = loads;
  await page.getByRole('button', { name: 'More', exact: true }).click();
  assert.equal(await page.getByRole('menuitemradio').count(), 0);
  const languageItem = page.getByRole('menuitem', { name: 'Language', exact: true });
  await languageItem.press('ArrowRight');
  await page.getByRole('menuitemradio', { name: 'English', exact: true }).waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('menuitemradio').count(), 0);
  assert.equal(await page.locator(':focus').getAttribute('aria-label'), 'Language');
  await languageItem.click();
  for (const [code, label, open] of [
    ['ru', 'Русский', 'Открыть документ'],
    ['es', 'Español', 'Abrir documento'],
    ['de', 'Deutsch', 'Dokument öffnen'],
    ['ja', '日本語', 'ドキュメントを開く'],
    ['zh', '简体中文', '打开文档'],
    ['he', 'עברית', 'פתיחת מסמך']
  ]) {
    await page.getByRole('menuitemradio', { name: label, exact: true }).click();
    await page.getByRole('button', { name: open, exact: true }).waitFor();
    assert.equal(new URL(page.url()).searchParams.get('lang'), code);
    assert.equal(new URL(page.url()).searchParams.get('keep'), 'yes');
    assert.equal(new URL(page.url()).hash, '#pages');
    assert.equal(
      await page.getByRole('menuitemradio', { name: label, exact: true }).getAttribute('aria-checked'),
      'true'
    );
  }
  assert.equal(loads, initialLoads, 'locale changes must not reload the document');
  assert.equal(await page.locator('[lang="he"][dir="rtl"]').count(), 1);
  await mkdir('/tmp/gpu-i18n-check', { recursive: true });
  await page.screenshot({ path: '/tmp/gpu-i18n-check/he.png' });
  await page.goBack();
  await page.getByRole('button', { name: '打开文档', exact: true }).waitFor();
  await page.goForward();
  await page.getByRole('button', { name: 'פתיחת מסמך', exact: true }).waitFor();
  await page.reload();
  await page.getByRole('button', { name: 'פתיחת מסמך', exact: true }).waitFor();
  await page.getByRole('button', { name: 'עוד', exact: true }).click();
  await page.getByRole('menuitem', { name: 'שפה', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'English', exact: true }).click();
  await page.getByRole('button', { name: 'Open document', exact: true }).waitFor();
  assert.equal(new URL(page.url()).searchParams.has('lang'), false);
  await page.getByRole('menuitem', { name: 'Back to menu', exact: true }).click();
  assert.equal(await page.getByRole('menuitemradio').count(), 0);
  await page.screenshot({ path: '/tmp/gpu-i18n-check/language-menu.png' });
  await page.getByRole('menuitem', { name: 'Language', exact: true }).click();
  await page.screenshot({ path: '/tmp/gpu-i18n-check/language-submenu.png' });
  await page.goto(`${url}/?lang=unknown`);
  await page.getByRole('button', { name: 'Open document', exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log('PASS seven languages, English default, RTL, URL/history/reload, no document reload');
} finally {
  await browser.close();
}
