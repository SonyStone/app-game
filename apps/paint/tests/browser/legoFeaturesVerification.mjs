import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

/** Exercises real worker-backed LEGO controls and layer gestures in isolated storage. */
export async function verifyLegoFeatures(browser, url, output) {
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
    await verifyLayers(page, context, url, output);
    await verifyOtherVariants(page, url, output);
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
    await box.locator('[class*="trayBar"]').click();
    const tile = box.locator(`div[title="${title}"]`);
    await tile.scrollIntoViewIfNeeded();
    const rect = await tile.boundingBox();
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    await page.mouse.down();
    await page.mouse.move(600 + i * 130, 350, { steps: 16 });
    await page.mouse.up();
    await page.waitForTimeout(300);
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

  assert.equal(await quick.getAttribute('aria-pressed'), 'false');
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
  assert.equal(await caption.innerText(), 'Mandala');
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
  await page.getByRole('button', { name: 'Edit', exact: true }).waitFor({ timeout: 60000 });
  await page.evaluate(() =>
    localStorage.setItem(
      'paint.lego',
      JSON.stringify({
        version: 2,
        board: {
          panels: [
            {
              id: 'layers-panel',
              at: { x: 0.1, y: 0.1 },
              parts: [
                { id: 'layers', kind: 'action:layers', cell: { column: 0, row: 0 }, span: { columns: 7, rows: 8 } }
              ]
            }
          ]
        }
      })
    )
  );
  await page.reload();
  const panel = page.locator('[data-part="layers"]');
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
    const tile = document.querySelector('[data-part="layers"]').getBoundingClientRect();
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
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Multiply');
  await page.keyboard.press('Enter');
  await menu.waitFor({ state: 'detached' });
  await page.waitForFunction(
    () =>
      window.paintState.document.layers.find((l) => l.id === window.paintState.document.activeId).blend === 'multiply'
  );
  assert.equal(await blend.innerText(), 'Multiply');
  await blend.click();
  await menu.waitFor();
  await page.keyboard.press('Escape');
  await menu.waitFor({ state: 'detached' });
  assert.equal(await blend.evaluate((e) => e === document.activeElement), true);
  await blend.click();
  await menu.waitFor();
  await page.mouse.click(500, 500);
  await menu.waitFor({ state: 'detached' });
  for (let i = 0; i < 17; i++) {
    await add.click();
    await page.waitForFunction((count) => window.paintState.document.layers.length === count, i + 3);
  }
  const list = panel.locator('[class*="layerList"]');
  const dimensions = await list.evaluate((e) => ({ client: e.clientHeight, scroll: e.scrollHeight }));
  assert.ok(dimensions.scroll > dimensions.client);
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
  await page.waitForTimeout(350);
  const scrollTop = await list.evaluate((e) => e.scrollTop);
  assert.ok(scrollTop > 30, `touch scrollTop=${scrollTop}`);
  await page.screenshot({ path: `${output}/layers-touch-scroll.png` });
  assert.ok((await panel.locator('img').count()) > 0, 'live thumbnails arrive');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await panel.click({ position: { x: 8, y: 8 } });
  const handle = page.getByLabel('Resize', { exact: true });
  const resize = async (dx, dy) => {
    const r = await handle.boundingBox();
    await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
    await page.mouse.down();
    await page.mouse.move(r.x + r.width / 2 + dx, r.y + r.height / 2 + dy, { steps: 20 });
    await page.mouse.up();
    await page.waitForTimeout(250);
  };
  await resize(-288, -336);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  assert.equal(await add.count(), 0);
  await panel.getByRole('button', { name: 'Layers', exact: true }).click();
  await page.getByRole('button', { name: 'Add layer', exact: true }).waitFor();
  await page.screenshot({ path: `${output}/layers-compact-popup.png` });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await panel.click({ position: { x: 8, y: 8 } });
  await resize(288, 336);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await add.waitFor();
  await page.screenshot({ path: `${output}/layers-inline-restored.png` });
  await page.waitForTimeout(500);
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
    'PASS layers add/select/reorder/hide, opacity single edit + one Undo restores, blend top layer + keys/Escape/outside, CDP touch scroll',
    { dimensions, scrollTop, geometry }
  );
  console.log('PASS compact/full resize and popup compatibility');
  await writeFile(
    `${output}/layers-browser-state.json`,
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
