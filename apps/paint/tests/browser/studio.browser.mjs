import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

/**
 * End-to-end smoke test of the editor UI in headless Chromium with WebGPU: panels, keyboard shortcuts, a mouse stroke
 * with undo/redo, duplicating and renaming a layer, and a switch from the worker to the main-thread engine that keeps the drawing (undo history is
 * per engine session and does not survive the switch).
 *
 *   node tests/browser/studio.browser.mjs
 *
 * Starts its own Vite dev server on a free port unless `PAINT_URL` points at a running one. Every run uses a fresh
 * browser profile, so it never touches drawings saved by the app on `localhost`. Exits non-zero on the first failed
 * step, on an uncaught page error or on a console error.
 */
const root = fileURLToPath(new URL('../../', import.meta.url));
const server = process.env.PAINT_URL ? undefined : await startServer();
const baseURL = process.env.PAINT_URL ?? server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({
  channel: process.env.PAINT_BROWSER_CHANNEL || undefined,
  headless: true,
  args: ['--enable-unsafe-webgpu', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])]
});
const pageErrors = [];

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (error) => pageErrors.push(`pageerror: ${error.stack ?? error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      pageErrors.push(`console.error: ${message.text()}`);
    }
  });
  await page.route('**/favicon.ico', (route) => route.fulfill({ status: 204 }));
  await page.goto(`${baseURL}/`);
  await waitForSaved(page);

  await step('resting the pointer on a toolbar button shows its visual hint', async () => {
    await page.getByRole('button', { name: 'Eraser', exact: true }).hover();
    const hint = page.getByRole('tooltip');
    await hint.waitFor({ timeout: 5_000 });
    assert.match(await hint.textContent(), /Eraser/);
    await page.screenshot({ path: path.join(os.tmpdir(), 'paint-tool-hint.png') });
    await page.getByRole('button', { name: 'Lasso', exact: true }).hover();
    await hint.filter({ hasText: 'Selection' }).waitFor({ timeout: 5_000 });
    await page.mouse.move(640, 400);
    await hint.waitFor({ state: 'detached', timeout: 5_000 });
  });

  await step('zoom buttons change the zoom level', async () => {
    await page.getByRole('button', { name: 'Zoom in' }).click();
    assert.equal(await page.getByRole('button', { name: 'Reset zoom' }).textContent(), '125%');
    await page.getByRole('button', { name: 'Reset zoom' }).click();
    assert.equal(await page.getByRole('button', { name: 'Reset zoom' }).textContent(), '100%');
  });

  await step('the view shows sharp pixels with a pixel grid up close by default', async () => {
    await page.getByRole('button', { name: 'Drawing menu' }).click();
    assert.equal(await page.getByLabel('Smooth pixels when zoomed in').isChecked(), false);
    assert.equal(await page.getByLabel(/^Pixel grid/).isChecked(), true);
    await page.keyboard.press('Escape');
  });

  await step('an empty layer opacity entry keeps the layer, and Escape closes the panel', async () => {
    await page.getByRole('button', { name: 'Layers' }).click();
    const opacity = page.getByLabel('Layer opacity');
    await opacity.fill('');
    await opacity.dispatchEvent('change');
    assert.equal(await opacity.inputValue(), '100');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#paint-panel').count(), 0);
  });

  await step('tool shortcuts ignore modifiers', async () => {
    const pressed = (name) => page.getByRole('button', { name, exact: true }).getAttribute('aria-pressed');
    await page.keyboard.press('l');
    assert.equal(await pressed('Lasso'), 'true');
    await page.keyboard.press('Alt+b');
    assert.equal(await pressed('Lasso'), 'true');
    await page.keyboard.press('b');
    assert.equal(await pressed('Brush'), 'true');
  });

  await step('Ctrl+Alt drag resizes the brush with a HUD', async () => {
    const size = page.getByRole('button', { name: 'Brush settings' }).locator('small');
    assert.equal(await size.textContent(), '32');
    const box = await page.getByRole('main', { name: 'Drawing workspace' }).boundingBox();
    const x = box.x + box.width / 2 - 200,
      y = box.y + box.height / 2;
    await page.keyboard.down('Control');
    await page.keyboard.down('Alt');
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 60, y, { steps: 3 });
    await page.mouse.move(x + 120, y, { steps: 3 });
    await page.getByText('64 px · 100%').waitFor({ timeout: 5_000 });
    await page.mouse.move(x, y, { steps: 3 });
    await page.mouse.up();
    await page.keyboard.up('Alt');
    await page.keyboard.up('Control');
    assert.equal(await size.textContent(), '32');
    assert.equal(await page.getByText(/ px · \d+%/).count(), 0);
  });

  await step('brush sizes and the chosen tool survive a reload', async () => {
    const size = page.getByRole('button', { name: 'Brush settings' }).locator('small');
    const pressed = (name) => page.getByRole('button', { name, exact: true }).getAttribute('aria-pressed');
    await page.keyboard.press(']');
    assert.equal(await size.textContent(), '40');
    await page.keyboard.press('e');
    await page.keyboard.press('[');
    assert.equal(await size.textContent(), '26');
    // Brush state is written to IndexedDB in the background.
    await page.waitForTimeout(500);
    await page.reload();
    await waitForSaved(page);
    assert.equal(await pressed('Eraser'), 'true');
    assert.equal(await size.textContent(), '26');
    await page.keyboard.press('b');
    assert.equal(await size.textContent(), '40');
    await page.keyboard.press('[');
    assert.equal(await size.textContent(), '32');
  });

  await step(
    'the brush panel chooses presets, saves changes as a new preset and sets how the eraser erases',
    async () => {
      const settings = page.getByRole('button', { name: 'Brush settings' });
      const panel = page.getByRole('complementary', { name: 'Brush' });
      const tile = (name) => panel.getByRole('group', { name: 'Brush presets' }).getByRole('button', { name });
      await page.keyboard.press('e');
      await settings.click();
      assert.equal(await panel.getByLabel('The brush (Clear mode)').isChecked(), true);
      await panel.getByLabel('Its own eraser brush').check();
      assert.equal(await tile('Eraser').getAttribute('aria-pressed'), 'true');
      await panel.getByLabel('The brush (Clear mode)').check();
      await page.keyboard.press('Escape');

      await page.keyboard.press('b');
      await settings.click();
      assert.equal(await tile('Soft round').getAttribute('aria-pressed'), 'true');
      const current = panel.getByRole('region', { name: 'Current preset' });
      await panel.getByRole('slider', { name: 'Opacity' }).fill('50');
      await current.getByText('Changed').waitFor({ timeout: 5_000 });
      await current.getByRole('button', { name: 'Save as…' }).click();
      await current.getByLabel('Preset name').fill('Half soft');
      await current.getByRole('button', { name: 'Save preset' }).click();
      assert.equal(await tile('Half soft').getAttribute('aria-pressed'), 'true');
      assert.equal(await current.getByText('Saved').count(), 1);
      await current.getByRole('button', { name: 'Delete', exact: true }).click();
      await current.getByRole('button', { name: 'Delete “Half soft”' }).click();
      assert.equal(await tile('Soft round').getAttribute('aria-pressed'), 'true');
      assert.equal(await tile('Half soft').count(), 0);
      await panel.getByRole('slider', { name: 'Opacity' }).fill('100');

      await panel.getByRole('button', { name: 'ABR brushes…' }).click();
      await page.getByRole('dialog', { name: 'ABR brush editor' }).waitFor({ timeout: 10_000 });
      await page.getByRole('button', { name: 'Close ABR editor' }).click();
      assert.equal(await page.getByRole('dialog', { name: 'ABR brush editor' }).isVisible(), false);
    }
  );

  await step('an open panel leaves the canvas usable and closes on contact unless pinned', async () => {
    const { cx, cy } = await workspaceCenter(page);
    const panel = page.locator('#paint-panel');
    await page.getByRole('button', { name: 'Layers' }).click();
    // The Layers panel opens on the left; draw right of it.
    await drawLine(page, { x: cx + 100, y: cy - 250 }, { x: cx + 200, y: cy - 250 });
    assert.equal(await panel.count(), 0, 'a stroke closes the panel');

    await page.getByRole('button', { name: 'Layers' }).click();
    await panel.getByRole('button', { name: 'Keep panel open' }).click();
    await drawLine(page, { x: cx + 100, y: cy - 230 }, { x: cx + 200, y: cy - 230 });
    assert.equal(await panel.count(), 1, 'a pinned panel stays open');
    await panel.getByRole('button', { name: 'Keep panel open' }).click();
    await page.keyboard.press('Escape');
    await undo(page, 2);
  });

  await step('a mouse stroke can be undone and redone', async () => {
    const undo = page.getByRole('button', { name: 'Undo' });
    const redo = page.getByRole('button', { name: 'Redo' });
    assert.equal(await undo.isDisabled(), true);
    await stroke(page);
    await waitForSaved(page);
    await waitEnabled(undo);
    await undo.click();
    await waitEnabled(redo);
    await redo.click();
    await waitEnabled(undo);
    assert.equal(await redo.isDisabled(), true);
  });

  await step('painting on a hidden layer is refused with a notice that shows the layer', async () => {
    const panel = page.getByRole('complementary', { name: 'Layers' });
    const notice = page.getByRole('toolbar', { name: 'Hidden layer' });
    await page.getByRole('button', { name: 'Layers' }).click();
    await panel.getByRole('button', { name: 'Hide Layer 1' }).click();
    await panel.getByRole('button', { name: 'Show Layer 1' }).waitFor({ timeout: 5_000 });
    await page.keyboard.press('Escape');
    await stroke(page);
    await notice.waitFor({ timeout: 5_000 });
    assert.match(await notice.textContent(), /Layer 1/);
    await notice.getByRole('button', { name: 'Show layer' }).click();
    await notice.waitFor({ state: 'detached', timeout: 5_000 });
    await page.getByRole('button', { name: 'Layers' }).click();
    await panel.getByRole('button', { name: 'Hide Layer 1' }).waitFor({ timeout: 5_000 });
    await page.keyboard.press('Escape');
    await waitForSaved(page);
  });

  await step('the right button opens quick actions around the puck, chosen by press or by a marking drag', async () => {
    const { cx, cy } = await workspaceCenter(page);
    const pressed = (name) => page.getByRole('button', { name, exact: true }).getAttribute('aria-pressed');
    const menu = page.getByRole('menu', { name: 'Quick actions' });
    await page.mouse.move(cx, cy);
    await page.mouse.down({ button: 'right' });
    await page.mouse.up({ button: 'right' });
    await menu.getByRole('menuitem', { name: 'Lasso' }).click({ timeout: 5_000 });
    await menu.waitFor({ state: 'detached', timeout: 5_000 });
    assert.equal(await pressed('Lasso'), 'true');

    // Pressing the button, dragging up past the puck to the brush and releasing chooses it.
    await page.mouse.move(cx, cy);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(cx, cy - 100, { steps: 8 });
    assert.equal(await menu.getByText('Brush', { exact: true }).count(), 1);
    await page.mouse.up({ button: 'right' });
    await menu.waitFor({ state: 'detached', timeout: 5_000 });
    assert.equal(await pressed('Brush'), 'true');
  });

  await step('the perceptual color wheel picks colors and keeps them inside a gamut mask', async () => {
    await page.getByRole('button', { name: 'Color palette' }).click();
    await page.getByRole('radio', { name: 'Wheel' }).click();
    const disk = await page.getByRole('slider', { name: 'Hue and saturation' }).boundingBox();
    const hex = page.getByLabel('Hex color');
    const before = await hex.inputValue();
    await page.mouse.click(disk.x + disk.width * 0.7, disk.y + disk.height * 0.35);
    assert.notEqual(await hex.inputValue(), before);
    await page.getByLabel('Gamut mask').selectOption('triangle');
    await page.getByRole('slider', { name: 'Hue and saturation' }).focus();
    for (let step = 0; step < 12; step++) {
      await page.keyboard.press('Shift+ArrowRight');
    }
    assert.match(await hex.inputValue(), /^[0-9A-F]{6}$/);

    // Dragging an edge dot adds a corner there; a double click on a corner removes it.
    const corners = page.getByRole('slider', { name: 'Mask corner' });
    const dot = await page.getByRole('button', { name: 'Add mask corner' }).first().boundingBox();
    await page.mouse.move(dot.x + dot.width / 2, dot.y + dot.height / 2);
    await page.mouse.down();
    await page.mouse.move(dot.x + dot.width / 2 + 15, dot.y + dot.height / 2 + 15, { steps: 4 });
    await page.mouse.up();
    assert.equal(await corners.count(), 4);
    await corners.nth(1).dblclick();
    assert.equal(await corners.count(), 3);
    await page.getByLabel('Gamut mask').selectOption('none');

    // The classic hue triangle: a press in the middle of the triangle picks a muted color.
    await page.getByRole('radio', { name: 'Triangle' }).click();
    const triangle = await page.getByRole('group', { name: 'Hue triangle' }).boundingBox();
    const beforeTriangle = await hex.inputValue();
    await page.mouse.click(triangle.x + triangle.width / 2, triangle.y + triangle.height / 2);
    assert.notEqual(await hex.inputValue(), beforeTriangle);
    await page.screenshot({ path: path.join(os.tmpdir(), 'paint-hue-triangle.png') });
    // Later steps draw with the color the wheel left.
    await hex.fill(beforeTriangle);
    await hex.press('Enter');
    await page.getByRole('radio', { name: 'Square' }).click();
    await page.keyboard.press('Escape');
  });

  await step('two- and three-finger taps undo and redo', async () => {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    const box = await page.getByRole('main', { name: 'Drawing workspace' }).boundingBox();
    const fingers = (count, x = box.x + 300, y = box.y + 200) =>
      Array.from({ length: count }, (_, id) => ({ x: x + id * 60, y, id }));
    const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
    const tap = async (count) => {
      await touch('touchStart', fingers(count));
      await page.waitForTimeout(60);
      await touch('touchEnd', []);
    };
    const undo = page.getByRole('button', { name: 'Undo' });
    const redo = page.getByRole('button', { name: 'Redo' });
    await stroke(page);
    await waitEnabled(undo);
    await tap(2);
    await waitEnabled(redo);
    await tap(3);
    // Undo may be enabled before the redo by earlier history, so wait for the redo itself.
    await redo.and(page.locator(':disabled')).waitFor({ timeout: 10_000 });

    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });
    await cdp.detach();
  });

  await step('the blend mode dropdown lists the modes with previews and applies a choice', async () => {
    const panel = page.getByRole('complementary', { name: 'Layers' });
    await page.getByRole('button', { name: 'Layers' }).click();
    const trigger = panel.getByRole('button', { name: 'Layer blend mode' });
    await trigger.click();
    const list = panel.getByRole('listbox', { name: 'Layer blend modes' });
    assert.equal(await list.getByRole('option').count(), 4);
    await page.screenshot({ path: path.join(os.tmpdir(), 'paint-blend-dropdown.png') });
    await list.getByRole('option', { name: 'Multiply' }).click();
    await list.waitFor({ state: 'detached', timeout: 5_000 });
    await panel.getByRole('button', { name: 'Layer blend mode' }).filter({ hasText: 'Multiply' }).waitFor({ timeout: 10_000 });
    await trigger.click();
    await page.keyboard.press('Escape');
    await list.waitFor({ state: 'detached', timeout: 5_000 });
    assert.equal(await panel.count(), 1, 'Escape closes the list, not the panel');
    // Smooth color is a setting of the whole drawing, on by default, outside the undo history.
    const smooth = panel.getByLabel('Smooth color for all layers');
    assert.equal(await smooth.isChecked(), true);
    await smooth.uncheck();
    await waitForSaved(page);
    await smooth.check();
    await waitForSaved(page);
    await undo(page, 1);
    await page.keyboard.press('Escape');
  });

  await step('a drawn layer can be duplicated, renamed, dragged, merged down and the steps undone', async () => {
    await page.getByRole('button', { name: 'Layers' }).click();
    const panel = page.getByRole('complementary', { name: 'Layers' });
    await panel.getByRole('button', { name: 'Duplicate layer' }).click();
    await panel.getByText('2 layers').waitFor({ timeout: 10_000 });
    const name = panel.getByLabel('Layer name');
    assert.equal(await name.inputValue(), 'Layer 1 copy');
    await name.fill('Inks');
    await name.press('Enter');
    await panel.getByRole('button', { name: 'Select Inks' }).waitFor({ timeout: 10_000 });

    // Dragging the top row's grip onto the bottom row moves the layer to the bottom.
    const rowNames = () => panel.getByRole('button', { name: /^Select / }).allTextContents();
    const grip = await panel.getByLabel('Reorder Inks').boundingBox();
    const target = await panel.getByRole('button', { name: 'Select Layer 1' }).boundingBox();
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await page.mouse.down();
    await page.mouse.move(grip.x + grip.width / 2, target.y + target.height / 2 + 4, { steps: 8 });
    await page.mouse.up();
    await page.waitForFunction(
      () => document.querySelector('[aria-label^="Select "]')?.getAttribute('aria-label') === 'Select Layer 1',
      undefined,
      { polling: 100, timeout: 10_000 }
    );
    assert.match((await rowNames()).join('|'), /^Layer 1.*\|Inks/);
    await page.keyboard.press('Control+z');
    await page.waitForFunction(
      () => document.querySelector('[aria-label^="Select "]')?.getAttribute('aria-label') === 'Select Inks',
      undefined,
      { polling: 100, timeout: 10_000 }
    );

    await panel.getByRole('button', { name: 'Merge down' }).click();
    await panel.getByText('1 layer', { exact: true }).waitFor({ timeout: 10_000 });
    assert.equal(await panel.getByLabel('Layer name').inputValue(), 'Layer 1');
    await waitForSaved(page);
    await page.keyboard.press('Escape');
    // Undo the merge, the rename and the duplicate.
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+z');
    await page.getByRole('button', { name: 'Layers' }).click();
    await panel.getByText('1 layer', { exact: true }).waitFor({ timeout: 10_000 });
    await page.keyboard.press('Escape');
    await waitForSaved(page);
  });

  await step('Alt-click and the canvas picker take the displayed color', async () => {
    const hex = () => page.getByLabel('Hex color').inputValue();
    /** The picked color arrives from the engine asynchronously; polls because rAF does not run in a hidden page. */
    const hexOtherThan = async (previous) => {
      await page.waitForFunction(
        (previous) => document.querySelector('input[aria-label="Hex color"]')?.value !== previous,
        previous,
        { polling: 100, timeout: 10_000 }
      );
      return hex();
    };
    await page.getByRole('button', { name: 'Color palette' }).click();
    await page.getByLabel('Hex color').fill('FF0000');
    await page.getByLabel('Hex color').press('Enter');
    assert.equal(await hex(), 'FF0000');
    await page.keyboard.press('Escape');

    // The stroke drawn earlier runs from the workspace center towards the lower right in black.
    const box = await page.getByRole('main', { name: 'Drawing workspace' }).boundingBox();
    await page.keyboard.down('Alt');
    await page.mouse.click(box.x + box.width / 2 + 60, box.y + box.height / 2 + 30);
    await page.keyboard.up('Alt');
    await page.getByRole('button', { name: 'Color palette' }).click();
    const stroke = await hexOtherThan('FF0000');
    const channels = (hex) => [0, 2, 4].map((index) => parseInt(hex.slice(index, index + 2), 16));
    assert.ok(Math.max(...channels(stroke)) < 0x90, `expected the dark stroke color, got ${stroke}`);
    await page.keyboard.press('Escape');

    // Hovering with Alt held previews the color under the pointer without picking it.
    await page.mouse.move(box.x + box.width / 2 - 150, box.y + box.height / 2 - 100);
    await page.keyboard.down('Alt');
    await page.mouse.move(box.x + box.width / 2 - 140, box.y + box.height / 2 - 100, { steps: 3 });
    const loupe = page.getByRole('status', { name: /^Picking #/ });
    await loupe.waitFor({ timeout: 10_000 });
    await page.keyboard.up('Alt');
    await loupe.waitFor({ state: 'detached', timeout: 5_000 });
    await page.getByRole('button', { name: 'Color palette' }).click();
    assert.equal(await hex(), stroke);
    await page.keyboard.press('Escape');

    // The eyedropper beside the color closes the panel; while it is armed, hovering shows the ring and a magnifier.
    await page.getByRole('button', { name: 'Pick color from canvas' }).click();
    await page.mouse.move(box.x + box.width / 2 - 160, box.y + box.height / 2 - 100);
    await page.mouse.move(box.x + box.width / 2 - 150, box.y + box.height / 2 - 100, { steps: 3 });
    await page.getByRole('status', { name: /^Picking #/ }).locator('canvas[data-ready="true"]').waitFor({ timeout: 10_000 });
    // Empty paper up and to the left of the stroke, clear of the toolbars along the edges.
    await page.mouse.click(box.x + box.width / 2 - 150, box.y + box.height / 2 - 100);
    await page.getByRole('button', { name: 'Color palette' }).click();
    const paper = await hexOtherThan(stroke);
    assert.ok(Math.min(...channels(paper)) > 0xe0, `expected the light paper color, got ${paper}`);
    await page.keyboard.press('Escape');
    await waitForSaved(page);
  });

  await step('an image placed from the menu or pasted becomes a centered layer', async () => {
    const png = (color) =>
      page.evaluate(async (fill) => {
        const canvas = new OffscreenCanvas(200, 120);
        const context = canvas.getContext('2d');
        context.fillStyle = fill;
        context.fillRect(0, 0, 200, 120);
        const bytes = new Uint8Array(await (await canvas.convertToBlob()).arrayBuffer());
        return btoa(String.fromCharCode(...bytes));
      }, color);
    await page.getByRole('button', { name: 'Drawing menu' }).click();
    await page.locator('input[type="file"][accept="image/*"]').setInputFiles({
      name: 'swatch.png',
      mimeType: 'image/png',
      buffer: Buffer.from(await png('#ff0000'), 'base64')
    });
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Layers' }).click();
    const panel = page.getByRole('complementary', { name: 'Layers' });
    await panel.getByText('2 layers').waitFor({ timeout: 10_000 });
    assert.equal(await panel.getByLabel('Layer name').inputValue(), 'swatch');
    await page.keyboard.press('Escape');

    // The image covers the view center, above the earlier stroke.
    const box = await page.getByRole('main', { name: 'Drawing workspace' }).boundingBox();
    await page.keyboard.down('Alt');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.keyboard.up('Alt');
    await page.getByRole('button', { name: 'Color palette' }).click();
    await page.waitForFunction(
      () => document.querySelector('input[aria-label="Hex color"]')?.value === 'FF0000',
      undefined,
      {
        polling: 100,
        timeout: 10_000
      }
    );
    await page.keyboard.press('Escape');

    const blue = await png('#0000ff');
    await page.evaluate((data) => {
      const bytes = Uint8Array.from(atob(data), (character) => character.charCodeAt(0));
      const clipboard = new DataTransfer();
      clipboard.items.add(new File([bytes], 'pasted.png', { type: 'image/png' }));
      window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: clipboard, bubbles: true, cancelable: true }));
    }, blue);
    await page.getByRole('button', { name: 'Layers' }).click();
    await panel.getByText('3 layers').waitFor({ timeout: 10_000 });
    assert.equal(await panel.getByLabel('Layer name').inputValue(), 'pasted');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+z');
    await page.getByRole('button', { name: 'Layers' }).click();
    await panel.getByText('1 layer', { exact: true }).waitFor({ timeout: 10_000 });
    await page.keyboard.press('Escape');
    await waitForSaved(page);
  });

  await step('the fill tool fills empty paper with the current color as one undo step', async () => {
    const hex = () => page.getByLabel('Hex color').inputValue();
    const box = await page.getByRole('main', { name: 'Drawing workspace' }).boundingBox();
    const paper = { x: box.x + box.width / 2 - 150, y: box.y + box.height / 2 - 100 };
    const pick = async (previous) => {
      await page.keyboard.down('Alt');
      await page.mouse.click(paper.x, paper.y);
      await page.keyboard.up('Alt');
      await page.getByRole('button', { name: 'Color palette' }).click();
      await page.waitForFunction(
        (previous) => document.querySelector('input[aria-label="Hex color"]')?.value !== previous,
        previous,
        { polling: 100, timeout: 10_000 }
      );
      const value = await hex();
      await page.keyboard.press('Escape');
      return value;
    };
    await page.getByRole('button', { name: 'Color palette' }).click();
    await page.getByLabel('Hex color').fill('00C040');
    await page.getByLabel('Hex color').press('Enter');
    await page.keyboard.press('Escape');

    // The fill works only inside a selection: without one, G is refused; a rectangle around the paper enables it.
    await page.keyboard.press('b');
    await page.keyboard.press('g');
    assert.equal(await page.getByRole('button', { name: 'Brush', exact: true }).getAttribute('aria-pressed'), 'true');
    await page.keyboard.press('l');
    await page.getByRole('button', { name: 'Rectangle selection' }).click();
    await page.mouse.move(paper.x - 60, paper.y - 60);
    await page.mouse.down();
    await page.mouse.move(paper.x + 60, paper.y + 60, { steps: 4 });
    await page.mouse.up();
    const fillTool = page.getByRole('toolbar', { name: 'Selection actions' }).getByRole('button', { name: 'Fill tool' });
    await fillTool.click();
    assert.equal(await fillTool.getAttribute('aria-pressed'), 'true');
    await page.getByRole('button', { name: 'Brush settings' }).click();
    assert.equal(await page.getByLabel('Fill sample').inputValue(), 'all');
    await page.keyboard.press('Escape');
    await page.mouse.click(paper.x, paper.y);
    await waitForSaved(page);
    // Alt-click with the fill tool picks the filled color; the pick replaces the current color with it.
    await page.getByRole('button', { name: 'Color palette' }).click();
    await page.getByLabel('Hex color').fill('FF0000');
    await page.getByLabel('Hex color').press('Enter');
    await page.keyboard.press('Escape');
    assert.equal(await pick('FF0000'), '00C040');

    await page.getByRole('button', { name: 'Undo' }).click();
    await waitForSaved(page);
    const restored = await pick('00C040');
    const channels = [0, 2, 4].map((index) => parseInt(restored.slice(index, index + 2), 16));
    assert.ok(Math.min(...channels) > 0xe0, `expected paper after undo, got ${restored}`);
    await page.keyboard.press('Control+d');
    await page.keyboard.press('b');
  });

  await step('the gradient tool draws a dragged gradient in the selection as one undo step', async () => {
    const { cx, cy } = await workspaceCenter(page);
    const bar = page.getByRole('toolbar', { name: 'Selection actions' });
    const pressed = (name) => page.getByRole('button', { name, exact: true }).getAttribute('aria-pressed');
    // Black to white.
    await page.keyboard.press('d');
    await page.keyboard.press('l');
    await page.getByRole('button', { name: 'Rectangle selection' }).click();
    await page.mouse.move(cx - 300, cy - 220);
    await page.mouse.down();
    await page.mouse.move(cx + 300, cy + 220, { steps: 4 });
    await page.mouse.up();
    await bar.getByRole('button', { name: 'Gradient tool' }).click();
    await page.mouse.move(cx - 200, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 200, cy, { steps: 6 });
    await page.mouse.up();
    await waitForSaved(page);
    await setColor(page, 'FF0000');
    assert.ok(Math.max(...(await pickRgb(page, { x: cx - 220, y: cy + 150 }, 'FF0000'))) < 0x20);
    await setColor(page, 'FF0000');
    assert.ok(Math.min(...(await pickRgb(page, { x: cx + 220, y: cy + 150 }, 'FF0000'))) > 0xe0);
    await undo(page, 1);

    // A reflected diamond: black at the start, white along the square through the end, gray again halfway past it.
    await page.keyboard.press('d');
    await page.getByRole('button', { name: 'Brush settings' }).click();
    await page.getByLabel('Gradient shape').selectOption('diamond');
    await page.getByLabel('Gradient repeat').selectOption('reflect');
    await page.keyboard.press('Escape');
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 100, cy, { steps: 6 });
    await page.mouse.up();
    await waitForSaved(page);
    await setColor(page, 'FF0000');
    // Smooth color brightens fast in encoded values: a few percent of white in linear light reads as dark gray.
    const startColor = await pickRgb(page, { x: cx, y: cy }, 'FF0000');
    assert.ok(Math.max(...startColor) < 0x40, `expected near black, got ${startColor}`);
    await setColor(page, 'FF0000');
    assert.ok(Math.min(...(await pickRgb(page, { x: cx + 50, y: cy - 49 }, 'FF0000'))) > 0xe0);
    await setColor(page, 'FF0000');
    const past = await pickRgb(page, { x: cx - 150, y: cy }, 'FF0000');
    assert.ok(past.every((channel) => channel > 0x50 && channel < 0xe0), `expected gray, got ${past}`);
    await undo(page, 1);
    await page.getByRole('button', { name: 'Brush settings' }).click();
    await page.getByLabel('Gradient shape').selectOption('linear');
    await page.getByLabel('Gradient repeat').selectOption('none');
    await page.keyboard.press('Escape');

    // Deselecting leaves the gradient for the lasso, as it works only inside a selection.
    await page.keyboard.press('Control+d');
    assert.equal(await pressed('Lasso'), 'true');

    // Fill selection paints an ellipse with the color, leaving the corners of the box it was dragged across.
    await page.getByRole('button', { name: 'Ellipse selection' }).click();
    await page.mouse.move(cx - 100, cy - 100);
    await page.mouse.down();
    await page.mouse.move(cx + 100, cy + 100, { steps: 4 });
    await page.mouse.up();
    await setColor(page, '0000FF');
    await bar.getByRole('button', { name: 'Fill selection' }).click();
    await waitForSaved(page);
    // Alt-click picks colors with the brush; with the lasso it is left to selecting.
    await page.keyboard.press('b');
    await setColor(page, 'FF0000');
    const [r, g, b] = await pickRgb(page, { x: cx + 60, y: cy }, 'FF0000');
    assert.ok(b > 0xe0 && r < 0x20 && g < 0x20, `expected blue in the ellipse, got ${[r, g, b]}`);
    await setColor(page, 'FF0000');
    const corner = await pickRgb(page, { x: cx - 90, y: cy - 90 }, 'FF0000');
    assert.ok(Math.min(...corner) > 0xe0, `expected paper in the corner, got ${corner}`);
    await undo(page, 1);
    await page.keyboard.press('Control+d');
    await page.keyboard.press('l');
    await page.getByRole('button', { name: 'Lasso selection' }).click();
    await page.getByRole('button', { name: 'Brush', exact: true }).click();
  });

  await step('up close, sharp pixels end on whole document pixels, where the pixel grid runs', async () => {
    const { cx, cy } = await workspaceCenter(page);
    await page.keyboard.press('l');
    await page.getByRole('button', { name: 'Rectangle selection' }).click();
    // Above the diagonal stroke of earlier steps, so only the rectangle's edge is in the sampled row.
    await page.mouse.move(cx - 200, cy - 60);
    await page.mouse.down();
    await page.mouse.move(cx + 10, cy - 15, { steps: 4 });
    await page.mouse.up();
    await setColor(page, '000000');
    await page.getByRole('toolbar', { name: 'Selection actions' }).getByRole('button', { name: 'Fill selection' }).click();
    await waitForSaved(page);
    await page.keyboard.press('Control+d');
    await page.getByRole('button', { name: 'Lasso selection' }).click();
    // The brush shows no selection hint over the sampled row.
    await page.keyboard.press('b');
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Control+=');
    }

    const zoom = Number((await page.getByRole('button', { name: 'Reset zoom' }).textContent()).replace('%', '')) / 100;

    // Along a row across the rectangle's right edge only the 1 px grid lines may be neither ink nor paper: sampling
    // between texels showed the edge pixel as a whole column of half ink.
    await page.waitForTimeout(500);
    const row = await page.evaluate(
      async ({ shot, y }) => {
        const image = new Image();
        image.src = `data:image/png;base64,${shot}`;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, Math.round(y), image.width, 1).data;
        return Array.from({ length: image.width }, (_, x) => pixels[x * 4 + 1]);
      },
      { shot: (await page.screenshot()).toString('base64'), y: cy - 35 * zoom }
    );
    let run = 0,
      longest = 0;
    for (const green of row.slice(Math.round(cx - 50), Math.round(cx + 300))) {
      run = green > 0x30 && green < 0xc0 ? run + 1 : 0;
      longest = Math.max(longest, run);
    }

    assert.ok(longest <= 2, `expected crisp pixel edges, found ${longest} px of half ink`);
    await page.getByRole('button', { name: 'Reset zoom' }).click();
    await undo(page, 1);
  });

  await step('a layer with locked transparency only recolors its own pixels', async () => {
    const { cx, cy } = await workspaceCenter(page);
    await page.getByRole('button', { name: 'Layers' }).click();
    await page.getByRole('button', { name: 'Add layer' }).click();
    await waitForSaved(page);
    await page.keyboard.press('Escape');
    await setColor(page, '000000');
    await drawLine(page, { x: cx + 200, y: cy - 120 }, { x: cx + 200, y: cy + 60 });
    await page.getByRole('button', { name: 'Layers' }).click();
    await page.getByRole('button', { name: 'Lock transparent pixels' }).click();
    await page.getByText(/transparency locked/).waitFor({ timeout: 5_000 });
    await page.keyboard.press('Escape');
    await setColor(page, 'FF0000');
    await drawLine(page, { x: cx + 120, y: cy - 40 }, { x: cx + 280, y: cy - 40 });

    const [r, g, b] = await pickRgb(page, { x: cx + 200, y: cy - 40 }, 'FF0000');
    assert.ok(r > g + 60 && r > b + 60, `expected the locked line recolored red, got ${[r, g, b]}`);
    await setColor(page, '00FF00');
    const paper = await pickRgb(page, { x: cx + 140, y: cy - 40 }, '00FF00');
    assert.ok(Math.min(...paper) > 0xe0, `expected untouched paper beside the line, got ${paper}`);
    await undo(page, 4);
  });

  await step('a clipped layer shows only over its base, also after merging down', async () => {
    const { cx, cy } = await workspaceCenter(page);
    const layers = page.getByRole('complementary', { name: 'Layers' });
    await page.getByRole('button', { name: 'Layers' }).click();
    await layers.getByRole('button', { name: 'Add layer' }).click();
    await waitForSaved(page);
    await page.keyboard.press('Escape');
    await setColor(page, '000000');
    await drawLine(page, { x: cx + 200, y: cy - 120 }, { x: cx + 200, y: cy + 60 });
    await page.getByRole('button', { name: 'Layers' }).click();
    await layers.getByRole('button', { name: 'Add layer' }).click();
    await waitForSaved(page);
    await layers.getByRole('button', { name: 'Clip to layer below' }).click();
    await layers.getByText(/^Clipped/).waitFor({ timeout: 5_000 });
    await page.keyboard.press('Escape');
    await setColor(page, 'FF0000');
    await drawLine(page, { x: cx + 120, y: cy - 40 }, { x: cx + 280, y: cy - 40 });

    const check = async () => {
      await setColor(page, '00FF00');
      const [r, g, b] = await pickRgb(page, { x: cx + 200, y: cy - 40 }, '00FF00');
      assert.ok(r > g + 60 && r > b + 60, `expected red over the base line, got ${[r, g, b]}`);
      await setColor(page, '0000FF');
      const paper = await pickRgb(page, { x: cx + 140, y: cy - 40 }, '0000FF');
      assert.ok(Math.min(...paper) > 0xe0, `expected the clipped stroke hidden off its base, got ${paper}`);
    };
    await check();
    await page.getByRole('button', { name: 'Layers' }).click();
    await layers.getByRole('button', { name: 'Merge down' }).click();
    await waitForSaved(page);
    await page.keyboard.press('Escape');
    await check();
    await undo(page, 6);
  });

  await step('the transform moves the layer live and applies as one undo step', async () => {
    const { cx, cy } = await workspaceCenter(page);
    await page.getByRole('button', { name: 'Layers' }).click();
    await page.getByRole('button', { name: 'Add layer' }).click();
    await waitForSaved(page);
    await page.keyboard.press('Escape');
    await setColor(page, '000000');
    await drawLine(page, { x: cx + 200, y: cy - 120 }, { x: cx + 200, y: cy + 60 });

    await page.keyboard.press('Control+t');
    const box = page.getByLabel('Transform box');
    await box.waitFor({ timeout: 10_000 });

    // A touch drag reaches its end instead of turning into a browser gesture: Chromium takes touch-action from the
    // <svg>, not from the box shape. Touch emulation stays enabled from the gesture step.
    const left = async () => Number((await box.locator('polygon').getAttribute('points')).split(',')[0]);
    const cdp = await page.context().newCDPSession(page);
    const touchDrag = async (dx) => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx + 200, y: cy }] });
      for (let i = 1; i <= 10; i++) {
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: cx + 200 + (dx * i) / 10, y: cy }]
        });
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    await page.evaluate(() => {
      window.transformCancels = 0;
      addEventListener('pointercancel', () => window.transformCancels++, true);
    });
    const before = await left();
    await touchDrag(60);
    assert.ok(Math.abs((await left()) - before - 60) < 2, 'a touch drag moves the box the whole way');
    await page.mouse.move(cx + 260, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 200, cy, { steps: 6 });
    await page.mouse.up();
    assert.equal(await page.evaluate(() => window.transformCancels), 0);

    await page.mouse.move(cx + 200, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 260, cy, { steps: 6 });
    await page.mouse.up();
    // The pixels leave their old place while the transform is open; inside the box, clicks drag the box.
    await page.waitForTimeout(500);
    await setColor(page, 'FF0000');
    assert.ok(Math.min(...(await pickRgb(page, { x: cx + 200, y: cy - 40 }, 'FF0000'))) > 0xe0);
    await page.getByRole('button', { name: 'Done' }).click();
    await box.waitFor({ state: 'detached', timeout: 10_000 });
    await waitForSaved(page);
    await setColor(page, '00FF00');
    assert.ok(Math.max(...(await pickRgb(page, { x: cx + 260, y: cy - 40 }, '00FF00'))) < 0x90);

    // One undo restores the line where it was.
    await undo(page, 1);
    await setColor(page, '0000FF');
    assert.ok(Math.max(...(await pickRgb(page, { x: cx + 200, y: cy - 40 }, '0000FF'))) < 0x90);
    await undo(page, 2);
  });

  await step('a warp bends the layer live by its grid points and applies the bend', async () => {
    const { cx, cy } = await workspaceCenter(page);
    await page.getByRole('button', { name: 'Layers' }).click();
    await page.getByRole('button', { name: 'Add layer' }).click();
    await waitForSaved(page);
    await page.keyboard.press('Escape');
    await setColor(page, '000000');
    await drawLine(page, { x: cx + 200, y: cy - 120 }, { x: cx + 200, y: cy + 60 });

    await page.keyboard.press('Control+t');
    const box = page.getByLabel('Transform box');
    await box.waitFor({ timeout: 10_000 });
    await page.getByRole('toolbar', { name: 'Transform actions' }).getByRole('button', { name: 'Warp' }).click();
    // Dragging the four inner points 100 px right bows the middle of the line about 56 px right.
    const points = box.getByLabel('Warp point');
    assert.equal(await points.count(), 16);
    // A finer grid has more points; back to the default grid for the drags below.
    const options = page.getByRole('toolbar', { name: 'Transform options' });
    await options.getByRole('button', { name: 'Warp grid 2×2' }).click();
    assert.equal(await points.count(), 49);
    await options.getByRole('button', { name: 'Warp grid 1×1' }).click();
    assert.equal(await points.count(), 16);
    for (const index of [5, 6, 9, 10]) {
      const handle = await points.nth(index).boundingBox();
      const from = { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 };
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(from.x + 100, from.y, { steps: 5 });
      await page.mouse.up();
    }

    const middle = cy - 30;
    await page.waitForTimeout(500);
    await setColor(page, 'FF0000');
    assert.ok(Math.max(...(await pickRgb(page, { x: cx + 252, y: middle }, 'FF0000'))) < 0x90, 'the preview bends');
    await page.getByRole('button', { name: 'Done' }).click();
    await box.waitFor({ state: 'detached', timeout: 10_000 });
    await waitForSaved(page);
    await setColor(page, '00FF00');
    assert.ok(Math.max(...(await pickRgb(page, { x: cx + 252, y: middle }, '00FF00'))) < 0x90, 'the result bends');
    // The edges of the stroke stay where they were, so the bend ends short of here.
    await setColor(page, '0000FF');
    assert.ok(Math.min(...(await pickRgb(page, { x: cx + 290, y: middle }, '0000FF'))) > 0xe0);
    await undo(page, 3);
  });

  await step('dragging inside a lasso selection moves only the outline; its bar starts a transform', async () => {
    const { cx, cy } = await workspaceCenter(page);
    await page.getByRole('button', { name: 'Layers' }).click();
    await page.getByRole('button', { name: 'Add layer' }).click();
    await waitForSaved(page);
    await page.keyboard.press('Escape');
    await setColor(page, '000000');
    await drawLine(page, { x: cx + 200, y: cy - 120 }, { x: cx + 200, y: cy + 60 });

    await page.keyboard.press('l');
    await page.mouse.move(cx + 150, cy - 150);
    await page.mouse.down();
    for (const [x, y] of [
      [cx + 250, cy - 150],
      [cx + 250, cy + 90],
      [cx + 150, cy + 90],
      [cx + 150, cy - 150]
    ]) {
      await page.mouse.move(x, y, { steps: 4 });
    }

    await page.mouse.up();
    const bar = page.getByRole('toolbar', { name: 'Selection actions' });
    await bar.getByRole('button', { name: 'Transform selection' }).waitFor({ timeout: 5_000 });
    await page.screenshot({ path: path.join(os.tmpdir(), 'paint-selection-bar.png') });
    // Drag inside: the outline moves, the pixels stay.
    await page.mouse.move(cx + 200, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 320, cy, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    await page.keyboard.press('b');
    await setColor(page, 'FF0000');
    assert.ok(Math.max(...(await pickRgb(page, { x: cx + 200, y: cy - 40 }, 'FF0000'))) < 0x90);

    await page.keyboard.press('l');
    await page.mouse.move(cx + 150, cy - 150);
    await page.mouse.down();
    for (const [x, y] of [
      [cx + 250, cy - 150],
      [cx + 250, cy + 90],
      [cx + 150, cy + 90],
      [cx + 150, cy - 150]
    ]) {
      await page.mouse.move(x, y, { steps: 4 });
    }

    await page.mouse.up();
    await bar.getByRole('button', { name: 'Transform selection' }).click();
    await page.getByLabel('Transform box').waitFor({ timeout: 10_000 });
    await page.getByRole('toolbar', { name: 'Transform actions' }).getByRole('button', { name: 'Cancel' }).click();
    await page.getByLabel('Transform box').waitFor({ state: 'detached', timeout: 10_000 });

    // The outline stays when another tool is chosen: the fill then fills only inside it.
    await page.keyboard.press('g');
    await page.mouse.click(cx + 170, cy + 60);
    await waitForSaved(page);
    await setColor(page, 'FF0000');
    assert.ok(Math.max(...(await pickRgb(page, { x: cx + 170, y: cy + 60 }, 'FF0000'))) < 0x40, 'filled inside');
    await setColor(page, 'FF0000');
    // Left of the lasso, above the earlier diagonal stroke.
    const outside = await pickRgb(page, { x: cx + 120, y: cy - 100 }, 'FF0000');
    assert.ok(Math.min(...outside) > 0xe0, `expected paper outside, got ${outside}`);

    // The brush paints only inside the outline too: a green stroke across it leaves the paper beside it untouched.
    await page.keyboard.press('b');
    await setColor(page, '00FF00');
    await drawLine(page, { x: cx + 100, y: cy - 100 }, { x: cx + 300, y: cy - 100 });
    await setColor(page, 'FF0000');
    const [r, g] = await pickRgb(page, { x: cx + 230, y: cy - 100 }, 'FF0000');
    assert.ok(g > 0xa0 && r < 0x60, `expected green inside, got ${[r, g]}`);
    for (const x of [cx + 120, cx + 280]) {
      await setColor(page, 'FF0000');
      const beside = await pickRgb(page, { x, y: cy - 100 }, 'FF0000');
      assert.ok(Math.min(...beside) > 0xe0, `expected paper beside the outline, got ${beside}`);
    }

    await page.keyboard.press('Control+d');
    await undo(page, 4);
  });

  await step('the visible canvas exports as PNG', async () => {
    await page.getByRole('button', { name: 'Drawing menu' }).click();
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 15_000 }),
      page.getByRole('button', { name: /Export visible canvas/ }).click()
    ]);
    assert.equal(download.suggestedFilename(), 'drawing-view.png');
    assert.equal(await page.getByRole('alert').count(), 0);
    await page.keyboard.press('Escape');
  });

  await step('a frame made from the view and adjusted with handles exports its rectangle as a PNG at 100%', async () => {
    const panel = page.getByRole('complementary', { name: 'Layers' });
    await page.getByRole('button', { name: 'Layers' }).click();
    await panel.getByRole('button', { name: 'New frame' }).click();
    assert.equal(await panel.getByLabel('Frame name').inputValue(), 'Frame 1');
    // Adjusting: zoomed out so the frame's corners are in view, the bottom-right corner dragged 280 × 200 document
    // pixels in shrinks the frame.
    await panel.getByRole('button', { name: 'Adjust frame' }).click();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Zoom out' }).click();
    const zoom = Number((await page.getByRole('button', { name: 'Reset zoom' }).textContent()).replace('%', '')) / 100;
    const corner = await page.getByLabel('Resize frame').nth(4).boundingBox();
    const from = { x: corner.x + corner.width / 2, y: corner.y + corner.height / 2 };
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x - 280 * zoom, from.y - 200 * zoom, { steps: 6 });
    await page.mouse.up();
    await page.getByRole('button', { name: 'Done adjusting the frame' }).click();
    assert.equal(await page.getByLabel('Resize frame').count(), 0);
    await page.getByRole('button', { name: 'Reset zoom' }).click();
    await page.getByRole('button', { name: 'Layers' }).click();
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 15_000 }),
      panel.getByRole('button', { name: 'Export frame as PNG' }).click()
    ]);
    assert.equal(download.suggestedFilename(), 'Frame 1.png');
    // The frame covered the 1280 × 800 view at 100%; PNG width and height are big-endian at bytes 16 and 20.
    const png = await readFile(await download.path());
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1000, 600]);
    assert.equal(await page.getByRole('alert').count(), 0);
    await panel.getByRole('button', { name: 'Delete frame' }).click();
    await page.keyboard.press('Escape');
  });

  await step('the Layers panel lists layers with paint in view and shows the others on request', async () => {
    const { cx, cy } = await workspaceCenter(page);
    const panel = page.getByRole('complementary', { name: 'Layers' });
    const rows = () => panel.getByRole('button', { name: /^Select / }).count();
    await page.getByRole('button', { name: 'Layers' }).click();
    await panel.getByRole('button', { name: 'Add layer' }).click();
    await waitForSaved(page);
    await page.keyboard.press('Escape');

    // Far from the earlier drawings, paint on the new layer: only it has paint in view.
    for (let i = 0; i < 6; i++) {
      await page.mouse.move(cx + 300, cy);
      await page.mouse.down({ button: 'middle' });
      await page.mouse.move(cx - 300, cy, { steps: 4 });
      await page.mouse.up({ button: 'middle' });
    }
    await drawLine(page, { x: cx - 60, y: cy }, { x: cx + 60, y: cy });
    await page.waitForTimeout(600);
    await page.getByRole('button', { name: 'Layers' }).click();
    const toggle = panel.getByRole('button', { name: /without paint in view$/ });
    await toggle.waitFor({ timeout: 5_000 });
    assert.equal(await rows(), 1);
    const total = Number((await panel.getByText(/^\d+ layers$/).textContent()).split(' ')[0]);
    await toggle.click();
    assert.equal(await rows(), total);
    await toggle.click();
    await page.keyboard.press('Escape');

    await undo(page, 2);
    await page.getByRole('button', { name: 'Drawing menu' }).click();
    await page.getByRole('button', { name: 'Reset view' }).click();
  });

  await step('switching to the main-thread engine keeps the drawing', async () => {
    await page.getByRole('button', { name: 'Drawing menu' }).click();
    await page.getByRole('button', { name: 'Developer' }).click();
    // The checkbox follows the running engine, so it stays checked until the switch completes.
    await page.getByLabel('Web Worker + OffscreenCanvas').click();
    await page.waitForURL(/paintThread=main/);
    await page.getByRole('button', { name: 'Close developer tools' }).click();
    // Undo history belongs to one engine session, so a disabled Undo shows that the replacement engine has reported
    // its own document state; until then the editor still shows the previous engine's state.
    const undo = page.getByRole('button', { name: 'Undo' });
    await undo.and(page.locator(':disabled')).waitFor({ timeout: 30_000 });
    await waitForSaved(page);
    // The replacement restored the saved drawing, so the empty-canvas hint stays hidden.
    assert.equal(await page.getByText('Pen to draw. Touch to move.').count(), 0);
  });

  await step('the layers export as a PSD that opens again as the drawing', async () => {
    await page.getByRole('button', { name: 'Drawing menu' }).click();
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30_000 }),
      page.getByRole('button', { name: /Export layers/ }).click()
    ]);
    assert.equal(download.suggestedFilename(), 'drawing.psd');
    // Without color mode data or resources, the layer count is the 16-bit value at byte 42, negative for a merged
    // transparency.
    const psd = await readFile(await download.path());
    assert.equal(psd.toString('latin1', 0, 4), '8BPS');
    const layers = -psd.readInt16BE(42);
    assert.ok(layers >= 1, `The PSD has ${layers} layers.`);

    await page.getByRole('button', { name: 'Drawing menu' }).click();
    await page.locator('input[type="file"][accept*=".psd"]').setInputFiles(await download.path());
    await waitForSaved(page);
    assert.equal(await page.getByRole('alert').count(), 0);
    assert.equal(await page.getByText('Pen to draw. Touch to move.').count(), 0);
  });

  await step('the drawing saves as a compressed version 4 file that opens again with its layers', async () => {
    const panel = page.getByRole('complementary', { name: 'Layers' });
    await page.getByRole('button', { name: 'Layers' }).click();
    const count = await panel.getByText(/^\d+ layers?$/).textContent();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Drawing menu' }).click();
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30_000 }),
      page.getByRole('button', { name: /Save drawing/ }).click()
    ]);
    assert.equal(download.suggestedFilename(), 'drawing.paint');
    const file = await readFile(await download.path());
    assert.equal(file.toString('latin1', 0, 8), 'PAINT4\r\n');
    assert.equal(file.toString('latin1', file.length - 4), 'P4IX');

    await page.getByRole('button', { name: 'Drawing menu' }).click();
    await page.locator('input[type="file"][accept*=".paint"]').setInputFiles(await download.path());
    await waitForSaved(page);
    assert.equal(await page.getByRole('alert').count(), 0);
    await page.getByRole('button', { name: 'Layers' }).click();
    await panel.getByText(count, { exact: true }).waitFor({ timeout: 10_000 });
    await page.keyboard.press('Escape');
  });

  await step('the drawing kept in a folder is written there as it changes and opens from it again', async () => {
    // Headless Chromium cannot show the folder picker: it is given a folder of the origin private file system.
    await page.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry('drawing-folder', { recursive: true }).catch(() => undefined);
      const folder = await root.getDirectoryHandle('drawing-folder', { create: true });
      window.showDirectoryPicker = async () => folder;
    });
    const folderFiles = () =>
      page.evaluate(async () => {
        const folder = await (await navigator.storage.getDirectory()).getDirectoryHandle('drawing-folder');
        const tiles = [];
        for await (const shard of (await folder.getDirectoryHandle('tiles')).values())
          for await (const tile of shard.values()) tiles.push(tile.name);
        const drawing = JSON.parse(await (await (await folder.getFileHandle('drawing.json')).getFile()).text());
        return { tiles, references: drawing.document.layers.flatMap((layer) => layer.tiles.map((tile) => tile.pixels.storageId)) };
      });
    const menu = page.getByRole('complementary', { name: 'Drawing' });
    await page.getByRole('button', { name: 'Drawing menu' }).click();
    await menu.getByRole('button', { name: /Keep in folder/ }).click();
    await menu.getByText('Kept in “drawing-folder”').waitFor({ timeout: 10_000 });
    await menu.getByText('Saved there').waitFor({ timeout: 60_000 });
    const before = await folderFiles();
    assert.ok(before.references.length > 0, 'the folder holds the drawing');
    assert.ok(before.references.every((id) => before.tiles.includes(id)), 'every tile of the drawing is in the folder');
    await page.keyboard.press('Escape');

    // A stroke adds only its new tiles; the drawing in the folder refers to them.
    await stroke(page);
    await waitForSaved(page);
    await page.waitForFunction(
      async (count) => {
        const folder = await (await navigator.storage.getDirectory()).getDirectoryHandle('drawing-folder');
        const drawing = JSON.parse(await (await (await folder.getFileHandle('drawing.json')).getFile()).text());
        return JSON.stringify(drawing.document.layers).length !== count;
      },
      JSON.stringify(before.references).length,
      { polling: 200, timeout: 30_000 }
    );
    const after = await folderFiles();
    assert.ok(after.references.every((id) => after.tiles.includes(id)), 'every tile of the changed drawing is in the folder');

    // Stopped and opened again, the drawing comes back from the folder, kept there.
    await page.getByRole('button', { name: 'Drawing menu' }).click();
    await menu.getByRole('button', { name: /Stop keeping in folder/ }).click();
    await menu.getByRole('button', { name: /Keep in folder/ }).waitFor({ timeout: 10_000 });
    await menu.getByRole('button', { name: /Open folder/ }).click();
    await menu.getByText('Kept in “drawing-folder”').waitFor({ timeout: 10_000 });
    assert.equal(await page.getByRole('alert').count(), 0);
    await page.keyboard.press('Escape');
    await waitForSaved(page);
  });

  assert.deepEqual(pageErrors, [], 'The page reported errors.');
  console.log('Studio UI smoke test passed.');
} catch (error) {
  console.error(error);
  if (pageErrors.length) {
    console.error(pageErrors.join('\n'));
  }

  process.exitCode = 1;
} finally {
  await browser.close();
  await server?.close();
}

/** Runs one named check and prefixes its failure with the name. */
/** The center of the drawing workspace in page pixels. */
async function workspaceCenter(page) {
  const box = await page.getByRole('main', { name: 'Drawing workspace' }).boundingBox();
  return { cx: box.x + box.width / 2, cy: box.y + box.height / 2 };
}

/** Draws a straight mouse stroke and waits until it is saved. */
async function drawLine(page, from, to) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / 12, from.y + ((to.y - from.y) * i) / 12);
  }

  await page.mouse.up();
  await waitForSaved(page);
}

/** Sets the current color through the color panel. */
async function setColor(page, hex) {
  await page.getByRole('button', { name: 'Color palette' }).click();
  await page.getByLabel('Hex color').fill(hex);
  await page.getByLabel('Hex color').press('Enter');
  await page.keyboard.press('Escape');
}

/** Alt-clicks `point` and returns the picked RGB, once it differs from the current color `previous`. */
async function pickRgb(page, point, previous) {
  await page.keyboard.down('Alt');
  await page.mouse.click(point.x, point.y);
  await page.keyboard.up('Alt');
  await page.getByRole('button', { name: 'Color palette' }).click();
  await page.waitForFunction(
    (previous) => document.querySelector('input[aria-label="Hex color"]')?.value !== previous,
    previous,
    { polling: 100, timeout: 10_000 }
  );
  const hex = await page.getByLabel('Hex color').inputValue();
  await page.keyboard.press('Escape');
  return [0, 2, 4].map((index) => parseInt(hex.slice(index, index + 2), 16));
}

/** Undoes `count` steps, waiting for each to be saved. */
async function undo(page, count) {
  for (let i = 0; i < count; i++) {
    await page.getByRole('button', { name: 'Undo' }).click();
    await waitForSaved(page);
  }
}

async function step(name, check) {
  try {
    await check();
    console.log(`PASS ${name}`);
  } catch (error) {
    throw new Error(`FAIL ${name}: ${error.message}`, { cause: error });
  }
}

/** Waits until the engine is ready and has no pending changes. */
function waitForSaved(page) {
  return page
    .getByRole('status')
    .filter({ hasText: /^Saved$/ })
    .waitFor({ timeout: 30_000 });
}

/** Waits until a button reflects an engine state change. */
function waitEnabled(button) {
  return button.and(button.page().locator(':enabled')).waitFor({ timeout: 10_000 });
}

/** Draws a short diagonal stroke with the mouse in the middle of the canvas. */
async function stroke(page) {
  const box = await page.getByRole('main', { name: 'Drawing workspace' }).boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(x + i * 12, y + i * 6);
  }

  await page.mouse.up();
}

/** A dev server without file watching, so edits made during the run never reload the page. */
async function startServer() {
  const server = await createServer({
    root,
    configFile: path.join(root, 'vite.config.ts'),
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false, watch: null }
  });
  await server.listen();
  return server;
}
