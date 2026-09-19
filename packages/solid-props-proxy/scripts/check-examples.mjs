import { expect } from '@playwright/test';
import assert from 'node:assert/strict';

/** Uses the real showcase controls to verify independent cleanup and replacement. */
export async function checkExamples(browser, client) {
  const page = await browser.newPage();
  const messages = [];
  page.on('pageerror', (error) => messages.push(error.message));
  page.on('console', (message) => {
    if (['warning', 'error'].includes(message.type())) messages.push(message.text());
  });
  try {
    await page.setContent('<body style="cursor: help"><div id="examples"></div></body>');
    await page.addScriptTag({ content: client });
    await page.evaluate(() => {
      window.disposeExamples = proxyChecks.mountExamples();
    });

    const styles = page.locator('[data-example="style-layers"]');
    await page.getByLabel('Layer A', { exact: true }).check();
    await page.getByLabel('Layer B', { exact: true }).check();
    await expect(styles.locator('.pp-readout output')).toHaveText('translateX(120px)');
    await page.getByLabel('Layer A offset').focus();
    await page.getByLabel('Layer A offset').press('Home');
    await expect(styles.locator('.pp-readout output')).toHaveText('translateX(120px)');
    await page.getByLabel('Layer A', { exact: true }).uncheck();
    await expect(styles.locator('.pp-readout output')).toHaveText('translateX(120px)');
    await page.getByLabel('Layer B', { exact: true }).uncheck();
    await expect(styles.locator('.pp-readout output')).toHaveText('translateX(0px)');
    await styles.locator('summary').click();
    await expect(styles.locator('pre')).toBeVisible();

    const handoff = page.locator('[data-example="target-handoff"]');
    await page.getByLabel('Enable inspection', { exact: true }).check();
    await handoff.getByRole('button', { name: 'Target B' }).click();
    await expect(handoff.locator('.pp-readout output').first()).toHaveText('base / active');
    await handoff.getByRole('button', { name: 'Element A' }).click();
    await expect(handoff.locator('.pp-readout output').last()).toHaveText('0');
    await handoff.getByRole('button', { name: 'Element B' }).click();
    await expect(handoff.locator('.pp-readout output').last()).toHaveText('1');
    await page.getByLabel('Enable inspection', { exact: true }).uncheck();
    await expect(handoff.locator('.pp-readout output').first()).toHaveText('base / base');

    await page.getByLabel('Saving', { exact: true }).check();
    await page.getByLabel('Syncing', { exact: true }).check();
    await page.getByLabel('Saving', { exact: true }).uncheck();
    await expect(page.locator('.pp-workspace')).toHaveJSProperty('inert', true);
    await expect(page.locator('#workspace-state .pp-readout output')).toHaveText('inert = true');
    await page.getByLabel('Syncing', { exact: true }).uncheck();
    await page.getByRole('button', { name: 'Add a note' }).click();
    await expect(page.locator('.pp-workspace .pp-muted')).toHaveText('1 notes added');

    await page.getByLabel('Review mode', { exact: true }).check();
    await expect(page.locator('props-proxy-review-panel')).toHaveAttribute('data-mode', 'review');
    await expect(page.locator('#custom-element .pp-readout output')).toHaveText('review');
    await page.getByLabel('Review mode', { exact: true }).uncheck();
    await expect(page.locator('props-proxy-review-panel')).toHaveAttribute('data-mode', 'edit');

    await page.getByLabel('Pan mode').check();
    await expect(page.locator('body')).toHaveCSS('cursor', 'grab');
    await page.getByLabel('Pick mode').check();
    await expect(page.locator('body')).toHaveCSS('cursor', 'crosshair');
    await page.getByLabel('Pan mode').uncheck();
    await expect(page.locator('body')).toHaveCSS('cursor', 'crosshair');
    await page.keyboard.press('Escape');
    await expect(page.getByLabel('Pick mode')).not.toBeChecked();
    await expect(page.locator('body')).toHaveCSS('cursor', 'help');
    await page.getByLabel('Pick mode').check();
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect(page.getByLabel('Pick mode')).not.toBeChecked();

    const editor = page.locator('[data-example="external-widget"] textarea');
    await page.getByLabel('Temporary read-only').check();
    await expect(editor).toHaveJSProperty('readOnly', true);
    await page.getByRole('button', { name: 'Widget read-only: false' }).click();
    await page.getByLabel('Temporary read-only').uncheck();
    await expect(editor).toHaveJSProperty('readOnly', true);
    await page.getByRole('button', { name: 'Widget read-only: true' }).click();
    await expect(editor).toHaveJSProperty('readOnly', false);
    await page.getByLabel('Temporary read-only').check();
    const oldEditor = await editor.elementHandle();
    await page.getByRole('button', { name: 'Replace widget element' }).click();
    await expect(editor).toHaveAttribute('aria-label', 'External editor 2');
    await expect(editor).toHaveJSProperty('readOnly', true);
    assert.equal(await oldEditor.evaluate((element) => element.readOnly), false);
    await page.getByLabel('Temporary read-only').uncheck();
    await expect(editor).toHaveJSProperty('readOnly', false);

    const preview = page.frameLocator('iframe').getByRole('button');
    await page.getByLabel('Inspect preview').check();
    await expect(preview).toHaveAttribute('title', 'Inspection is active');
    await preview.click();
    await expect(page.locator('.pp-event-count')).toHaveText('Inspection clicks: 1');
    const oldPreview = await page
      .locator('iframe')
      .evaluateHandle((frame) => frame.contentDocument.querySelector('button'));
    await page.getByRole('button', { name: 'Reload preview' }).click();
    await expect(preview).toHaveText('Preview 2');
    await expect(preview).toHaveAttribute('title', 'Inspection is active');
    assert.equal(await oldPreview.evaluate((element) => element.getAttribute('title')), null);
    await preview.click();
    await expect(page.locator('.pp-event-count')).toHaveText('Inspection clicks: 2');
    await page.getByLabel('Inspect preview').uncheck();
    await expect(preview).not.toHaveAttribute('title', 'Inspection is active');
    await preview.click();
    await expect(page.locator('.pp-event-count')).toHaveText('Inspection clicks: 2');

    assert.deepEqual(await page.evaluate(() => proxyChecks.checkForeignProperties()), {
      foreign: true,
      covered: ['upper', 'new-base overlay'],
      lowerRemoved: 'upper',
      restored: ['new base', 'new-base', false],
      widgetCovered: 'review',
      widgetRestored: 'edit',
      widgetStyleRestored: ''
    });
    await page.getByLabel('Pick mode').check();
    await page.evaluate(() => window.disposeExamples());
    await expect(page.locator('body')).toHaveCSS('cursor', 'help');
    assert.deepEqual(messages, []);
    console.log('Chromium: all seven playground examples, live DOM readouts, and owner cleanup passed.');
  } finally {
    await page.close();
  }
}
