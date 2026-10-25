import { expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

/** Exercises real worker-backed LEGO controls and layer gestures in isolated storage. */
export async function verifyLegoFeatures(browser, url, output, masterUrl) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, hasTouch: true });
  await context.addInitScript(() => {
    window.paintCommands = [];
    window.paintEvents = [];
    const Original = window.Worker;
    window.Worker = class extends Original {
      constructor(...args) {
        super(...args);
        this.addEventListener('message', ({ data }) => {
          if (data.type === 'state') {
            window.paintState = data;
          }

          if (data.type === 'layer-thumbnails') {
            window.paintEvents.push({ type: data.type, at: performance.now() });
          }
        });
      }
      postMessage(data, ...args) {
        if (data?.type && !['init', 'samples'].includes(data.type)) {
          window.paintCommands.push({ ...data, at: performance.now() });
        }

        return super.postMessage(data, ...args);
      }
    };
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  try {
    await verifyControls(page, context, url, output);
    await verifySymmetrySizes(page, url, output);
    await verifyLayers(page, context, url, output);
    await verifyOtherVariants(page, url, output);
    if (masterUrl) {
      await compareVariantPanels(browser, url, masterUrl, output);
    }
    assert.deepEqual(errors, [], 'feature workflows have no uncaught errors');
  } catch (error) {
    await page.screenshot({ path: `${output}/features-failure.png` }).catch(() => {});
    throw error;
  } finally {
    await context.close();
  }
}

/** Places actual box tiles, draws with symmetry/QuickShape, and opens pressure calibration. */
async function verifyControls(page, context, url, output) {
  await page.goto(`${url}/variants.html#lego`);
  await page.getByRole('button', { name: 'Edit', exact: true }).waitFor({ timeout: 60000 });
  await page.waitForFunction(() => window.paintState?.document.layers.length);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const box = page.getByRole('complementary', { name: 'Box of parts' });
  // Each placement closes the sheet. Drag the actual box tiles into free board space.
  for (const [i, title] of ['Symmetry', 'QuickShape', 'Pressure calibration', 'Layers'].entries()) {
    const placed = page.locator(
      `[data-part-kind="action:${['symmetry', 'quickshape', 'pressure', 'layers'][i]}"][data-mode="edit"]`
    );
    const previous = await placed.count();
    await box.locator('[class*="trayBar"]').click();
    const tile = box.locator(`div[title="${title}"]`);
    await tile.scrollIntoViewIfNeeded();
    const rect = await tile.boundingBox();
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    await page.mouse.down();
    await page.mouse.move(600 + i * 130, 350, { steps: 16 });
    await page.mouse.up();
    await expect(box).toHaveAttribute('data-closed', '');
    await expect(placed).toHaveCount(previous + 1);
  }
  await page.screenshot({ path: `${output}/features-placed-from-box.png` });
  const board = await page.evaluate(() => JSON.parse(localStorage.getItem('paint.lego')).board);
  const added = Object.fromEntries(
    ['symmetry', 'quickshape', 'pressure', 'layers'].map((id) => [
      id,
      board.panels
        .flatMap((p) => p.parts)
        .filter((p) => p.kind === `action:${id}`)
        .at(-1)
    ])
  );
  assert.equal(board.panels.find((panel) => panel.owner === added.layers.id)?.window?.name, 'Layers');
  assert.equal(board.panels.find((panel) => panel.owner === added.layers.id)?.window?.open, undefined);
  for (const part of Object.values(added)) {
    assert.ok(part);
  }

  await page.getByRole('button', { name: 'Done', exact: true }).click();
  // Compact symmetry toggles the actual document feature and enables the guide.
  await page.locator(`[data-part="${added.symmetry.id}"] button`).click();
  await page.getByLabel('Paint symmetry guide').waitFor();
  await page.waitForFunction(() =>
    window.paintCommands.some((c) => c.type === 'feature' && c.command.mode === 'vertical')
  );
  const cdp = await context.newCDPSession(page);
  const stroke = async (hold = false) => {
    for (let i = 0; i <= 16; i++) {
      await cdp.send('Input.dispatchMouseEvent', {
        type: i === 0 ? 'mousePressed' : 'mouseMoved',
        x: 700 + i * 10,
        y: 580 + Math.sin(i / 5) * 10,
        button: 'left',
        buttons: 1,
        clickCount: 1,
        pointerType: 'pen',
        force: 0.7
      });
    }
    if (hold) {
      await page.waitForTimeout(1000);
    }

    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: 860,
      y: 580,
      button: 'left',
      buttons: 0,
      clickCount: 1,
      pointerType: 'pen'
    });
    await page.waitForTimeout(400);
  };
  await stroke();
  await page.screenshot({ path: `${output}/symmetry-stroke.png` });
  const quick = page.locator(`[data-part="${added.quickshape.id}"] button`);
  if ((await quick.getAttribute('aria-pressed')) === 'true') {
    await quick.click();
  }

  await expect(quick).toHaveAttribute('aria-pressed', 'false');
  await stroke(true);
  assert.equal(await page.evaluate(() => window.paintCommands.filter((c) => c.type === 'replace-stroke').length), 0);
  await quick.click();
  await stroke(true);
  await page.waitForFunction(() => window.paintCommands.some((c) => c.type === 'replace-stroke'));
  await page.screenshot({ path: `${output}/quickshape-stroke.png` });
  await page.locator(`[data-part="${added.pressure.id}"] button`).click();
  await page.getByRole('dialog', { name: /pressure/i }).waitFor();
  await page.screenshot({ path: `${output}/pressure-window.png` });
  await page.locator(`[data-part="${added.pressure.id}"] button`).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const symmetryPart = page.locator(`[data-part="${added.symmetry.id}"]`);
  await symmetryPart.click({ position: { x: 8, y: 8 } });
  const corner = await page.getByLabel('Resize', { exact: true }).boundingBox();
  await page.mouse.move(corner.x + corner.width / 2, corner.y + corner.height / 2);
  await page.mouse.down();
  await page.mouse.move(corner.x + corner.width / 2 + 48, corner.y + corner.height / 2 + 48, { steps: 12 });
  await page.mouse.up();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  const modes = symmetryPart.getByRole('combobox', { name: 'Paint symmetry mode' });
  for (const mode of ['off', 'vertical', 'horizontal', 'dual', 'diagonal', 'radial', 'mandala']) {
    await modes.selectOption(mode);
    await page.waitForFunction(
      (mode) => window.paintCommands.filter((c) => c.type === 'feature').at(-1)?.command.mode === mode,
      mode
    );
  }
  await symmetryPart.getByRole('button', { name: 'Symmetry', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="Paint symmetry mode"]').value === 'off');
  await symmetryPart.getByRole('button', { name: 'Symmetry', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="Paint symmetry mode"]').value === 'mandala');
  const caption = symmetryPart.locator('button span');
  assert.equal(await caption.innerText(), 'Symmetry');
  assert.ok((await modes.boundingBox()).height >= 36, 'symmetry mode touch height');
  assert.ok(await caption.evaluate((element) => element.scrollWidth <= element.clientWidth), 'mode label fits at 2×2');
  await page.screenshot({ path: `${output}/symmetry-mode-chooser.png` });
  console.log('PASS placement, symmetry stroke, QuickShape disabled/enabled held strokes, pressure window');
  await writeFile(
    `${output}/feature-browser-state.json`,
    JSON.stringify(
      await page.evaluate(() => ({
        commands: window.paintCommands,
        state: window.paintState,
        board: JSON.parse(localStorage.getItem('paint.lego'))
      })),
      null,
      2
    )
  );
}

/** Checks guarded edits, top-layer dismissal, native touch scrolling, resizing and idle-only thumbnails. */
async function verifyLayers(page, context, url, output) {
  await page.goto(`${url}/variants.html#lego`);
  await page.getByRole('button', { name: 'Edit', exact: true }).waitFor();
  await page.evaluate(() =>
    localStorage.setItem(
      'paint.lego',
      JSON.stringify({
        version: 1,
        board: {
          panels: [
            {
              id: 'buttons',
              at: { x: 0.1, y: 0.15 },
              parts: [
                { id: 'layers', kind: 'action:layers', cell: { column: 0, row: 0 }, span: { columns: 2, rows: 1 } },
                { id: 'layers-two', kind: 'action:layers', cell: { column: 0, row: 1 }, span: { columns: 2, rows: 1 } },
                { id: 'swatch', kind: 'color', cell: { column: 0, row: 2 }, span: { columns: 2, rows: 1 } }
              ]
            }
          ]
        }
      })
    )
  );
  await page.reload();
  const button = page.locator('[data-part="layers"]').getByRole('button', { name: 'Layers', exact: true });
  const second = page.locator('[data-part="layers-two"]').getByRole('button', { name: 'Layers', exact: true });
  const panel = page.locator('[data-panel="layers-panel"]');
  const panelTwo = page.locator('[data-panel="layers-two-panel"]');
  await button.waitFor();
  await expect(panel).toHaveCount(0);
  await button.click();
  await expect(panel).toBeVisible();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await second.click();
  await expect(panelTwo).toBeVisible();
  await expect(panel).toBeVisible();
  await second.click();
  await expect(panelTwo).toHaveCount(0);
  // A color folder still closes outside; windows remain open while painting.
  await page.locator('[data-part="swatch"] button').click();
  const folder = page.locator('[data-panel="swatch-panel"]');
  await expect(folder).toBeVisible();
  await page.mouse.click(1000, 800);
  await expect(folder).toHaveCount(0);
  await expect(panel).toBeVisible();
  const handle = panel.locator('[data-window-handle]');
  const initial = await handle.boundingBox();
  await page.mouse.move(initial.x + 8, initial.y + initial.height / 2);
  await page.mouse.down();
  await page.mouse.move(initial.x + 188, initial.y + initial.height / 2 + 30, { steps: 12 });
  await page.mouse.up();
  await expect.poll(() => handle.boundingBox().then((rect) => Math.round(rect.x))).toBe(Math.round(initial.x + 180));
  await page.screenshot({ path: `${output}/layers-window-live.png` });
  await panel.getByRole('button', { name: 'Collapse Layers', exact: true }).click();
  await expect(panel).toHaveAttribute('data-collapsed', '');
  await expect(panel.locator('[data-part]')).toHaveCount(0);
  await page.screenshot({ path: `${output}/layers-window-collapsed.png` });
  await panel.getByRole('button', { name: 'Expand Layers', exact: true }).click();
  await button.click();
  await expect(panel).toHaveCount(0);
  await button.click();
  await expect(panel).toBeVisible();
  await expect.poll(() => handle.boundingBox().then((rect) => Math.round(rect.x))).toBe(Math.round(initial.x + 180));
  const add = panel.getByRole('button', { name: 'Add layer', exact: true });
  await add.waitFor({ timeout: 60000 });
  await page.waitForFunction(() => window.paintState?.document.layers.length);
  await add.click();
  await page.waitForFunction(() => window.paintState.document.layers.length === 2);
  await panel.getByRole('button', { name: 'Select Layer 1', exact: true }).click();
  await page.waitForFunction(
    () => window.paintState.document.layers.find((l) => l.id === window.paintState.document.activeId).name === 'Layer 1'
  );
  await panel.getByRole('button', { name: 'Move layer up', exact: true }).click();
  await page.waitForFunction(() => window.paintState.document.layers.at(-1).name === 'Layer 1');
  const grip = await panel.getByLabel('Reorder Layer 1', { exact: true }).boundingBox();
  const target = await panel.getByRole('button', { name: 'Select Layer 2', exact: true }).boundingBox();
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2, target.y + target.height / 2, { steps: 15 });
  await page.mouse.up();
  await page.waitForFunction(() => window.paintState.document.layers[0].name === 'Layer 1');
  await panel.getByRole('button', { name: 'Hide Layer 1', exact: true }).click();
  await panel.getByRole('button', { name: 'Show Layer 1', exact: true }).waitFor();
  const opacity = panel.getByRole('spinbutton', { name: 'Layer opacity' });
  const rect = await opacity.boundingBox();
  await page.evaluate(() => {
    window.paintCommands = [];
  });
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width / 2 - 60, rect.y + rect.height / 2, { steps: 15 });
  assert.equal(await page.evaluate(() => window.paintCommands.filter((c) => c.type === 'layer').length), 0);
  await page.mouse.up();
  await page.waitForFunction(() => window.paintCommands.some((c) => c.type === 'layer'));
  assert.equal(await page.evaluate(() => window.paintCommands.filter((c) => c.type === 'layer').length), 1);
  await page.waitForFunction(() => document.querySelector('[aria-label="Layer opacity"]').value !== '100');
  const afterOpacity = await opacity.inputValue();
  assert.notEqual(afterOpacity, '100');
  await page.keyboard.press('ControlOrMeta+z');
  await page.waitForFunction(() => document.querySelector('[aria-label="Layer opacity"]').value === '100');
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await page.waitForFunction(
    (value) => document.querySelector('[aria-label="Layer opacity"]').value === value,
    afterOpacity
  );
  const blend = panel.getByRole('button', { name: 'Layer blend mode', exact: true });
  await blend.click();
  const menu = page.getByRole('listbox', { name: 'Layer blend modes' });
  await menu.waitFor();
  assert.equal(await menu.evaluate((e) => e.matches(':popover-open')), true);
  const geometry = await menu.evaluate((e) => {
    const r = e.getBoundingClientRect();
    const tile = document.querySelector('[data-panel="layers-panel"]').getBoundingClientRect();
    return {
      x: r.x,
      y: r.y,
      bottom: r.bottom,
      right: r.right,
      tileTop: tile.top,
      hit: e.contains(document.elementFromPoint(r.x + r.width / 2, r.y + 20))
    };
  });
  assert.ok(geometry.hit);
  assert.ok(geometry.bottom <= 992 && geometry.right <= 1432, JSON.stringify(geometry));
  await page.screenshot({ path: `${output}/layers-blend-top-layer.png` });
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('option', { name: 'Multiply', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await menu.waitFor({ state: 'detached' });
  await page.waitForFunction(
    () =>
      window.paintState.document.layers.find((l) => l.id === window.paintState.document.activeId).blend === 'multiply'
  );
  await expect(blend).toHaveText('Multiply');
  await blend.click();
  await menu.waitFor();
  await page.keyboard.press('Escape');
  await menu.waitFor({ state: 'detached' });
  await expect(blend).toBeFocused();
  await blend.click();
  await menu.waitFor();
  await page.mouse.click(500, 500);
  await menu.waitFor({ state: 'detached' });
  await blend.click();
  await menu.waitFor();
  await page.setViewportSize({ width: 1400, height: 960 });
  await menu.waitFor({ state: 'detached' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await blend.click();
  await menu.waitFor();
  await panel.evaluate((element) => element.dispatchEvent(new Event('scroll')));
  await menu.waitFor({ state: 'detached' });
  await panel.getByRole('button', { name: 'Smooth color', exact: true }).click();
  await page.waitForFunction(() => window.paintState.document.linearBlending === true);
  for (let i = 0; i < 17; i++) {
    await add.click();
    await page.waitForFunction((count) => window.paintState.document.layers.length === count, i + 3);
  }
  const list = panel.locator('[class*="layerList"]');
  const dimensions = await list.evaluate((e) => ({ client: e.clientHeight, scroll: e.scrollHeight }));
  assert.ok(dimensions.scroll > dimensions.client);
  const rows = await list.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const row = element.firstElementChild.getBoundingClientRect();
    return { listHeight: bounds.height, rowHeight: row.height, visible: Math.floor(bounds.height / row.height) };
  });
  assert.ok(rows.visible >= 5, `5×5 must show five complete rows: ${JSON.stringify(rows)}`);
  await page.screenshot({ path: `${output}/layers-window-five-rows.png` });
  console.log('PASS 5×5 list layout', rows);
  await writeFile(`${output}/layers-visible-rows.json`, JSON.stringify(rows, null, 2));
  const area = await list.boundingBox();
  const cdp = await context.newCDPSession(page);
  // Keep this swipe in the upper viewport; lower-edge CDP scrolling also fails on plain HTML in headless Chrome.
  const x = area.x + area.width / 2;
  const y = area.y + area.height - 8;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= 12; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - i * 7 }] });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBeGreaterThan(30);
  const scrollTop = await list.evaluate((e) => e.scrollTop);
  assert.ok(scrollTop > 30, `touch scrollTop=${scrollTop}`);
  await page.screenshot({ path: `${output}/layers-touch-scroll.png` });
  await expect(panel.locator('img')).toHaveCount(await page.evaluate(() => window.paintState.document.layers.length));
  const thumbnails = await panel.locator('img').evaluateAll((images) => images.map((image) => image.src));
  await panel.locator('img').evaluateAll((images) =>
    images.forEach((image) => {
      image.dataset.retained = 'true';
    })
  );
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  assert.deepEqual(await panel.locator('img').evaluateAll((images) => images.map((image) => image.src)), thumbnails);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  assert.equal(await panel.locator('img:not([data-retained])').count(), 0, 'Edit/Done preserves image nodes');
  assert.deepEqual(await panel.locator('img').evaluateAll((images) => images.map((image) => image.src)), thumbnails);
  await verifyPlateTouch(page, context, panel.locator('[data-part-kind="layers:list"]'));
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await panel.getByRole('button', { name: 'Rename Layers', exact: true }).click();
  await panel.getByRole('textbox', { name: 'Window name', exact: true }).fill('My Layers');
  await page.keyboard.press('Enter');
  await expect(panel.getByRole('button', { name: 'Rename My Layers', exact: true })).toBeVisible();
  await page.screenshot({ path: `${output}/layers-window-edit.png` });
  // Select the owner to discover the folder/window conversion action.
  await page.locator('[data-part="layers"]').click();
  await page.getByRole('button', { name: 'Make folder', exact: true }).click();
  await expect(panel.locator('[data-window-handle]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Make window', exact: true }).click();
  await expect(panel.locator('[data-window-handle]')).toBeVisible();
  // Rename again after conversion; the custom name survives reload.
  await panel.getByRole('button', { name: 'Rename Layers', exact: true }).click();
  await panel.getByRole('textbox', { name: 'Window name', exact: true }).fill('My Layers');
  await page.keyboard.press('Enter');
  const box = page.getByRole('complementary', { name: 'Box of parts' });
  await box.locator('[class*="trayBar"]').click();
  const windowTile = box.locator('div[title="Window"]');
  await windowTile.scrollIntoViewIfNeeded();
  const windowRect = await windowTile.boundingBox();
  await page.mouse.move(windowRect.x + windowRect.width / 2, windowRect.y + windowRect.height / 2);
  await page.mouse.down();
  await page.mouse.move(1000, 350, { steps: 16 });
  await page.mouse.up();
  const freeWindow = page
    .locator('[data-window]')
    .filter({ has: page.getByRole('toolbar', { name: 'Window window', exact: true }) });
  await expect(freeWindow).toBeVisible();
  await expect(freeWindow).toContainText('Drop parts here');
  // A window accepts ordinary parts, and its cells keep the existing resize and transfer behavior.
  const addPart = panel.locator('[data-part]').filter({ has: page.locator('[data-part-kind="layer:add"]') });
  const addId = await addPart.getAttribute('data-part');
  const addRect = await addPart.boundingBox();
  const emptyRect = await freeWindow.boundingBox();
  await page.mouse.move(addRect.x + 22, addRect.y + 22);
  await page.mouse.down();
  await page.mouse.move(emptyRect.x + 24, emptyRect.y + 60, { steps: 12 });
  await page.mouse.up();
  await expect(freeWindow.locator(`[data-part="${addId}"]`)).toHaveCount(1);
  await expect(panel.locator('[data-part-kind="layer:add"]')).toHaveCount(0);
  await freeWindow.locator(`[data-part="${addId}"]`).click();
  const corner = freeWindow.getByLabel('Resize', { exact: true });
  const cornerRect = await corner.boundingBox();
  await page.mouse.move(cornerRect.x + cornerRect.width / 2, cornerRect.y + cornerRect.height / 2);
  await page.mouse.down();
  await page.mouse.move(cornerRect.x + cornerRect.width / 2 + 48, cornerRect.y + cornerRect.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(() =>
      page.evaluate(
        (id) =>
          JSON.parse(localStorage.getItem('paint.lego'))
            .board.panels.flatMap((panel) => panel.parts)
            .find((part) => part.id === id)?.span.columns,
        addId
      )
    )
    .toBe(2);
  // Moving the part out leaves the empty window available for the next composition.
  const movedRect = await freeWindow.locator(`[data-part="${addId}"]`).boundingBox();
  await page.mouse.move(movedRect.x + 20, movedRect.y + 20);
  await page.mouse.down();
  await page.mouse.move(1150, 580, { steps: 12 });
  await page.mouse.up();
  await expect(freeWindow.locator('[data-part]')).toHaveCount(0);
  await expect(freeWindow).toContainText('Drop parts here');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(freeWindow).not.toContainText('Drop parts here');
  await page.reload();
  await expect(page.getByRole('toolbar', { name: 'My Layers window', exact: true })).toBeVisible();
  await expect(page.getByRole('toolbar', { name: 'Window window', exact: true })).toBeVisible();
  await page.waitForFunction(() => window.paintState?.document.layers.length);
  await page.evaluate(() => {
    window.paintEvents = [];
  });
  for (let i = 0; i <= 20; i++) {
    await cdp.send('Input.dispatchMouseEvent', {
      type: i === 0 ? 'mousePressed' : 'mouseMoved',
      x: 700 + i * 8,
      y: 600,
      button: 'left',
      buttons: 1,
      clickCount: 1,
      pointerType: 'pen',
      force: 0.6
    });
    await page.waitForTimeout(10);
  }
  assert.equal(await page.evaluate(() => window.paintEvents.length), 0, 'thumbnails stay idle throughout a stroke');
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: 860,
    y: 600,
    button: 'left',
    buttons: 0,
    clickCount: 1,
    pointerType: 'pen'
  });
  await page.waitForFunction(() => window.paintEvents.length > 0);
  console.log('PASS live layer thumbnails arrive after, never during, a stroke');
  console.log(
    'PASS Layers windows: independent open state, live handle drag, collapse, rename, folder conversion, Window box entry and persistence'
  );
  console.log(
    'PASS ordinary Layers parts: list/reorder/visibility, opacity one undo, blend menu, smooth color and touch scroll'
  );
  await cdp.detach();
}

/** Existing variants retain their layer selection, visibility and blend controls. */
async function verifyOtherVariants(page, url, output) {
  for (const id of ['desktop', 'zen', 'procreate']) {
    await page.goto(`${url}/variants.html#${id}`);
    await page.waitForFunction(() => window.paintState?.document.layers.length, undefined, { timeout: 60000 });
    if (id === 'zen') {
      await page
        .getByRole('button', { name: 'Tools · drag to move · hold, then drag for size and opacity', exact: true })
        .click();
      await page.getByRole('button', { name: 'Layers and export', exact: true }).click();
    }

    if (id === 'procreate') {
      await page.getByRole('button', { name: 'Layers', exact: true }).click();
    }

    const initial = await page.evaluate(() => window.paintState.document.layers.length);
    await page
      .getByRole('button', { name: id === 'desktop' || id === 'zen' ? 'New layer' : 'Add layer', exact: true })
      .click();
    await page.waitForFunction((n) => window.paintState.document.layers.length === n + 1, initial);
    const name = await page.evaluate(
      () => window.paintState.document.layers.find((l) => l.id === window.paintState.document.activeId).name
    );
    const eye = page.getByRole('checkbox', { name: `Show ${name}`, exact: true });
    await eye.click();
    await page.waitForFunction(
      () =>
        window.paintState.document.layers.find((l) => l.id === window.paintState.document.activeId).visible === false
    );

    if (id === 'desktop') {
      await page.getByRole('combobox', { name: 'Blend mode', exact: true }).selectOption('multiply');
    }

    if (id === 'procreate') {
      await page.getByRole('button', { name: 'Blend mode and opacity: Normal, 100 %', exact: true }).first().click();
      await page.getByRole('radio', { name: 'Multiply', exact: true }).click();
    }

    await page.waitForTimeout(200);
    await page.screenshot({ path: `${output}/layers-${id}.png` });
    console.log('PASS variant layer panel', id);
  }
}

/** A jittery press on a live plate must not yield to browser pan or zoom. */
async function verifyPlateTouch(page, context, panel) {
  const plate = panel.locator('xpath=ancestor::*[contains(@class,"panel")][1]');
  assert.equal(await plate.evaluate((element) => getComputedStyle(element).touchAction), 'none');
  await page.evaluate(() => {
    window.plateTouch = { cancelled: 0, released: 0, x: scrollX, y: scrollY, scale: visualViewport.scale };
    document.addEventListener('pointercancel', () => window.plateTouch.cancelled++, { once: true });
    document.addEventListener('pointerup', () => window.plateTouch.released++, { once: true });
  });
  const rect = await plate.boundingBox();
  const cdp = await context.newCDPSession(page);
  const x = rect.x + rect.width - 3;
  const y = rect.y + rect.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (const offset of [3, -4, 6, -5, 2]) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + offset }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const result = await page.evaluate(() => ({
    ...window.plateTouch,
    afterX: scrollX,
    afterY: scrollY,
    afterScale: visualViewport.scale
  }));
  assert.equal(result.cancelled, 0);
  assert.equal(result.released, 1);
  assert.equal(result.afterX, result.x);
  assert.equal(result.afterY, result.y);
  assert.equal(result.afterScale, result.scale);
  await cdp.detach();
  console.log('PASS live plate jitter keeps pointer ownership and page position/scale', result);
}

/** Compares isolated, identically seeded layer panels against the read-only master checkout. */
async function compareVariantPanels(browser, url, masterUrl, output) {
  for (const id of ['desktop', 'zen', 'procreate', 'studio']) {
    const shots = [];
    for (const [label, origin] of [
      ['round2', url],
      ['master', masterUrl]
    ]) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      try {
        const page = await context.newPage();
        await page.goto(`${origin}/variants.html#${id}`);
        await page
          .getByRole('button', {
            name:
              id === 'desktop'
                ? 'New layer'
                : id === 'zen'
                  ? 'Tools · drag to move · hold, then drag for size and opacity'
                  : 'Layers',
            exact: true
          })
          .waitFor({ timeout: 60000 });
        let panel;
        if (id === 'desktop') {
          panel = page.getByRole('listbox', { name: 'Layers', exact: true }).locator('..');
        } else if (id === 'zen') {
          await page
            .getByRole('button', { name: 'Tools · drag to move · hold, then drag for size and opacity', exact: true })
            .click();
          await page.getByRole('button', { name: 'Layers and export', exact: true }).click();
          panel = page.getByRole('dialog');
        } else {
          await page.getByRole('button', { name: 'Layers', exact: true }).click();
          panel =
            id === 'studio' ? page.locator('.paint-layers') : page.getByRole('dialog', { name: 'Layers', exact: true });
        }
        const add = page.getByRole('button', {
          name: ['desktop', 'zen'].includes(id) ? 'New layer' : 'Add layer',
          exact: true
        });
        await add.waitFor();
        await page.waitForFunction(
          (label) => !document.querySelector(`[aria-label="${label}"]`)?.disabled,
          ['desktop', 'zen'].includes(id) ? 'New layer' : 'Add layer'
        );
        await add.click();
        await page
          .getByRole(id === 'studio' ? 'button' : 'checkbox', {
            name: id === 'studio' ? 'Hide Layer 2' : 'Show Layer 2',
            exact: true
          })
          .waitFor();
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(350);
        await page.mouse.move(1400, 900);
        shots.push(await panel.screenshot({ path: `${output}/compare-${id}-${label}.png`, animations: 'disabled' }));
        if (id === 'studio') {
          await page.getByRole('button', { name: 'Layer blend mode', exact: true }).click();
          const menu = page.getByRole('listbox', { name: 'Layer blend modes' });
          await menu.waitFor();
          assert.equal(await menu.evaluate((element) => getComputedStyle(element).width), '220px');
          await menu.screenshot({ path: `${output}/compare-studio-blend-${label}.png` });
        }
      } finally {
        await context.close();
      }
    }
    assert.ok(shots[0].equals(shots[1]), `${id} layer panel must be pixel-identical to master`);
    console.log('PASS pixel-identical layer panel vs master 52a28f3f', id);
  }
}

/** Labels identify the tool while off, with a single mode readout and touch-sized chooser. */
async function verifySymmetrySizes(page, url, output) {
  const spans = [
    { columns: 1, rows: 1 },
    { columns: 2, rows: 1 },
    { columns: 2, rows: 2 }
  ];
  await page.evaluate(
    (spans) =>
      localStorage.setItem(
        'paint.lego',
        JSON.stringify({
          version: 2,
          board: {
            panels: [
              {
                id: 'symmetry-sizes',
                at: { x: 0.1, y: 0.1 },
                parts: spans.map((span, i) => ({
                  id: `symmetry-${i}`,
                  kind: 'action:symmetry',
                  cell: { column: i * 3, row: 0 },
                  span
                }))
              }
            ]
          }
        })
      ),
    spans
  );
  await page.reload();
  const chooser = page
    .locator('[data-part="symmetry-2"]')
    .getByRole('combobox', { name: 'Paint symmetry mode', exact: true });
  await expect(chooser).toHaveCount(1);
  // Enabled follows canUpdateSymmetry, after restoration and startup brush preparation.
  await page.waitForFunction(() => !document.querySelector('[data-part="symmetry-2"] select')?.disabled);
  await chooser.selectOption('off');
  const buttons = page.locator('[data-part] [data-mode="live"]').getByRole('button', { name: 'Symmetry', exact: true });
  await expect(buttons).toHaveCount(spans.length);
  await expect(chooser).toHaveValue('off');
  for (const button of await buttons.all()) {
    await expect(button).toHaveAttribute('aria-pressed', 'false');
  }
  await page.waitForFunction(() =>
    window.paintCommands.some(
      (command) => command.type === 'feature' && command.feature === 'symmetry' && command.command.mode === 'off'
    )
  );
  for (const [i, span] of spans.entries()) {
    const part = page.locator(`[data-part="symmetry-${i}"]`);
    const button = part.getByRole('button', { name: 'Symmetry', exact: true });
    assert.equal(await button.innerText(), span.columns === 1 ? '' : 'Symmetry');
    assert.equal(await button.getAttribute('aria-pressed'), 'false');
    await part.screenshot({ path: `${output}/symmetry-${span.columns}x${span.rows}-off.png` });
  }
  await chooser.selectOption('horizontal');
  await expect(page.locator('[data-part="symmetry-1"] button')).toHaveText('Horizontal');
  assert.equal(await page.locator('[data-part="symmetry-1"] button').innerText(), 'Horizontal');
  assert.equal(await page.locator('[data-part="symmetry-2"] button').innerText(), 'Symmetry');
  await page.screenshot({ path: `${output}/symmetry-sizes-active.png` });
  console.log('PASS symmetry labels at 1×1, 2×1, 2×2');
}
