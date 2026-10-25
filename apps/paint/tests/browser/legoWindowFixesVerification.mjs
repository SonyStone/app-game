/* global localStorage, document, window, console */
import { expect } from '@playwright/test';
import assert from 'node:assert/strict';

/** Checks migration recovery, v4 floating conversion, grip input and mixed-kit placement in Chrome at 2× scale. */
export async function verifyWindowFixes(page, context, url, output) {
  await page.goto(`${url}/variants.html#lego`);
  await page.getByRole('button', { name: 'Edit', exact: true }).waitFor();
  await verifyFloatingGrip(page, context, output);
  const part = (id, kind, column = 0, row = 0) => ({
    id,
    kind,
    cell: { column, row },
    span: { columns: 2, rows: 1 }
  });
  const toolbar = {
    id: 'toolbar',
    at: { x: 0.1, y: 0.15 },
    parts: [
      part('file', 'action:file'),
      part('undo', 'action:undo', 2),
      part('opener', 'action:layers', 4),
      part('redo', 'action:redo', 6)
    ]
  };
  await seed(page, 2, [toolbar]);
  const redo = page.locator('[data-part="redo"]');
  await redo.waitFor();
  const undoRect = await page.locator('[data-part="undo"]').boundingBox();
  const redoRect = await redo.boundingBox();
  assert.equal(Math.round(redoRect.x - undoRect.x), 96, 'migration closes the two-cell opener gap');
  await page.locator('[data-floating-grip]').waitFor();
  await page.screenshot({ path: `${output}/v2-toolbar-no-hole.png` });

  const custom = [
    part('custom-undo', 'action:undo'),
    { ...part('custom-hex', 'color:hex', 0, 1), span: { columns: 3, rows: 1 }, future: 42 }
  ];
  await seed(page, 3, [
    toolbar,
    { id: 'custom-folder', owner: 'opener', at: { x: 0, y: 0 }, parts: custom, futureFolder: 17 }
  ]);
  await page.locator('[data-panel="custom-folder"] [data-floating-grip]').waitFor();
  await dragGrip(page, page.locator('[data-panel="custom-folder"]'), 20, 0);
  const recovered = page.locator('[data-panel="custom-folder"]');
  await expect(recovered.locator('[data-part]')).toHaveCount(2);
  const stored = await savedPanel(page, 'custom-folder');
  assert.deepEqual(stored.parts, custom);
  assert.equal(stored.owner, undefined);
  assert.equal(stored.futureFolder, 17);
  await page.screenshot({ path: `${output}/v3-custom-layers-folder.png` });

  const layerParts = await page.evaluate(async () => (await import('/src/variants/lego/layersKit.ts')).layersKit.parts);
  await seed(page, 4, [
    {
      id: 'edge',
      at: { x: 0.94, y: 0.91 },
      parts: layerParts,
      window: { name: 'Edge', icon: 'layers', collapsed: true }
    }
  ]);
  const edge = page.locator('[data-panel="edge"]');
  await expect(edge.locator('[data-part]')).toHaveCount(layerParts.length);
  const before = await edge.boundingBox();
  assert.ok(before.x + before.width <= page.viewportSize().width);
  assert.ok(before.y + before.height <= page.viewportSize().height);
  await dragGrip(page, edge, -50, -20);
  const migrated = await savedPanel(page, 'edge');
  assert.equal(migrated.floating, true);
  assert.equal(migrated.window, undefined);
  await page.screenshot({ path: `${output}/v4-edge-floating.png` });

  const kits = [
    {
      id: 'mixed',
      name: 'Mixed regression',
      parts: [part('kit-undo', 'action:undo'), part('kit-opener', 'action:layers', 2)],
      owned: [{ owner: 'kit-opener', parts: layerParts, window: { name: 'Kit Layers' } }]
    }
  ];
  // Exercise both a bare-board drop and a drop joining an existing panel.
  for (const join of [false, true]) {
    await seed(page, 3, [{ id: 'target', at: { x: 0.1, y: 0.15 }, parts: [part('target-file', 'action:file')] }], kits);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const box = page.getByRole('complementary', { name: 'Box of parts' });
    await box.locator('[class*="trayBar"]').click();
    const kit = box.locator('div[title="Kit: Mixed regression"]');
    await kit.scrollIntoViewIfNeeded();
    const rect = await kit.boundingBox();
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    await page.mouse.down();
    await page.mouse.move(700, 120, { steps: 16 });
    await expect
      .poll(() =>
        page
          .locator('[data-panel="target"]')
          .boundingBox()
          .then((rect) => Math.round(rect.width))
      )
      .toBe(104);
    const target = await page.locator('[data-part="target-file"]').boundingBox();
    const drop = join ? { x: target.x + 40, y: target.y + 20 } : { x: 1100, y: 130 };
    await page.mouse.move(drop.x, drop.y, { steps: 16 });
    await page.mouse.up();
    await expect(box).toHaveAttribute('data-closed', '');
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    const floating = page.locator('[data-floating]');
    await floating.waitFor();
    const placed = page.locator('[data-part-kind="action:undo"]').locator('..').locator('..');
    await expect(placed).toHaveCount(1);
    await placed.evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
    await page.screenshot({ path: `${output}/mixed-kit-${join ? 'panel' : 'bare'}.png` });
    const blockRect = await placed.boundingBox();
    const windowRect = await floating.boundingBox();
    const overlap =
      Math.min(blockRect.x + blockRect.width, windowRect.x + windowRect.width) - Math.max(blockRect.x, windowRect.x);
    const overlapY =
      Math.min(blockRect.y + blockRect.height, windowRect.y + windowRect.height) - Math.max(blockRect.y, windowRect.y);
    assert.ok(
      overlap <= 0 || overlapY <= 0,
      `mixed-kit window must not cover the placed parts: ${JSON.stringify({ join, blockRect, windowRect })}`
    );
    const viewport = page.viewportSize();
    assert.ok(
      windowRect.x >= 0 &&
        windowRect.y >= 0 &&
        windowRect.x + windowRect.width <= viewport.width + 1 &&
        windowRect.y + windowRect.height <= viewport.height + 1,
      'mixed-kit window stays in view'
    );
    const data = await page.evaluate(() => JSON.parse(localStorage.getItem('paint.lego')).board);
    const host = data.panels.find((panel) => panel.parts.some((part) => part.kind === 'action:undo'));
    assert.equal(host.id === 'target', join, 'kit joins the intended panel only on the panel drop');
  }
  console.log('PASS floating migration regressions: recovery, gap compaction, v4 expanded contents, mixed kits');
}

/** Installs a legacy/current fixture and waits for a fresh live board. */
async function seed(page, version, panels, kits = []) {
  await page.evaluate(
    ({ version, panels, kits }) => {
      localStorage.setItem('paint.lego', JSON.stringify({ version, board: { panels } }));
      localStorage.setItem('paint.lego.kits', JSON.stringify({ version, kits }));
    },
    { version, panels, kits }
  );
  await page.reload();
  await page.getByRole('button', { name: 'Edit', exact: true }).waitFor();
  await page.locator('[data-panel]').first().waitFor();
  await page.evaluate(() => document.fonts.ready);
}

/** Reads persisted state, including the original position before any edit. */
async function savedPanel(page, id) {
  return page.evaluate(
    (id) => JSON.parse(localStorage.getItem('paint.lego')).board.panels.find((panel) => panel.id === id),
    id
  );
}

/** Migrated v4 plates have no chrome, consume pen/touch input, and keep their top-left through reload. */
async function verifyFloatingGrip(page, context, output) {
  const parts = await page.evaluate(async () => (await import('/src/variants/lego/layersKit.ts')).layersKit.parts);
  const toolbar = {
    id: 'pinned-toolbar',
    at: { x: 0.07, y: 0.12 },
    parts: [{ id: 'mixing', kind: 'action:mixing', cell: { column: 0, row: 0 }, span: { columns: 2, rows: 1 } }]
  };
  const panels = [
    toolbar,
    ...[true, undefined].map((collapsed, index) => ({
      id: `migrated-${index}`,
      at: { x: 0.25 + index * 0.35, y: 0.12 },
      parts: parts.map((part) => ({ ...part, id: `${index}-${part.id}` })),
      window: { name: index ? 'Expanded' : 'Collapsed', icon: 'layers', collapsed }
    }))
  ];
  await seed(page, 4, panels);
  const panel = page.locator('[data-panel="migrated-0"]');
  const grip = panel.locator('[data-floating-grip]');
  await expect(grip).toBeVisible();
  for (const [index, fixture] of panels.slice(1).entries()) {
    const migrated = page.locator(`[data-panel="migrated-${index}"]`);
    await expect(migrated.locator('[data-part]')).toHaveCount(parts.length);
    const rect = await migrated.boundingBox();
    assert.equal(Math.round(rect.x), Math.round(fixture.at.x * 1440));
    assert.equal(Math.round(rect.y), Math.round(fixture.at.y * 1000));
    await expect(
      migrated.locator('input[aria-label="Window name"], [data-window-tile], [data-window-collapse]')
    ).toHaveCount(0);
  }
  await expect(page.locator('[data-panel="pinned-toolbar"] [data-floating-grip]')).toHaveCount(0);
  await page.waitForFunction(() => window.paintState?.document.layers.length);
  await page.screenshot({ path: `${output}/floating-next-to-pinned-live.png` });
  const strip = await grip.boundingBox();
  assert.equal(strip.height, 14);
  await page.screenshot({
    path: `${output}/floating-strip-2x.png`,
    clip: { x: strip.x - 8, y: strip.y - 12, width: strip.width + 16, height: 68 }
  });
  const cdp = await context.newCDPSession(page);
  const penDrag = async (dx, dy, outside = false) => {
    const before = await panel.boundingBox();
    const rect = await grip.boundingBox();
    const x = rect.x + 30;
    const y = rect.y + (outside ? -5 : 7);
    await page.evaluate(() => {
      window.paintCommands = [];
    });
    for (let i = 0; i <= 10; i++) {
      await cdp.send('Input.dispatchMouseEvent', {
        type: i === 0 ? 'mousePressed' : 'mouseMoved',
        x: x + (dx * i) / 10,
        y: y + (dy * i) / 10,
        button: 'left',
        buttons: 1,
        clickCount: 1,
        pointerType: 'pen',
        force: 0.6
      });
    }
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: x + dx,
      y: y + dy,
      button: 'left',
      buttons: 0,
      pointerType: 'pen'
    });
    await expect.poll(() => panel.boundingBox().then((rect) => Math.round(rect.x))).toBe(Math.round(before.x + dx));
    await expect.poll(() => panel.boundingBox().then((rect) => Math.round(rect.y))).toBe(Math.round(before.y + dy));
    assert.equal(
      await page.evaluate(
        () =>
          window.paintCommands.filter((c) => c.type === 'begin' || c.type === 'end' || c.type === 'replace-stroke')
            .length
      ),
      0,
      'grip never sends stroke commands'
    );
  };
  await penDrag(70, 35, true);
  const beforeTouch = await panel.boundingBox();
  const touchGrip = await grip.boundingBox();
  const x = touchGrip.x + 80;
  const y = touchGrip.y + 7;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let step = 1; step <= 10; step++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: x + step * 4, y: y + step * 2 }]
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => panel.boundingBox().then((rect) => Math.round(rect.x))).toBe(Math.round(beforeTouch.x + 40));
  assert.equal(
    await page.evaluate(
      () => window.paintCommands.filter((c) => ['begin', 'end', 'replace-stroke'].includes(c.type)).length
    ),
    0,
    'touch grip sends no stroke'
  );
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page
    .locator('div[data-editing]')
    .evaluate((element) => Promise.allSettled(element.getAnimations().map((a) => a.finished)));
  await page.screenshot({ path: `${output}/floating-next-to-pinned-edit.png` });
  await penDrag(40, 20);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  const stored = await savedPanel(page, 'migrated-0');
  assert.equal(stored.floating, true);
  assert.equal(stored.window, undefined);
  const originalExpanded = await savedPanel(page, 'migrated-1');
  assert.deepEqual(originalExpanded.at, panels[2].at);
  await page.reload();
  await expect(grip).toBeVisible();
  assert.deepEqual((await savedPanel(page, 'migrated-0')).at, stored.at);
  await cdp.detach();
  console.log('PASS v4 collapsed/expanded migration, pen/touch Live grip, pen Edit grip, no stroke, persistence');
}

/** Moves a plate through the same visible grip used by pen and touch. */
async function dragGrip(page, panel, dx, dy) {
  const rect = await panel.locator('[data-floating-grip]').boundingBox();
  await page.mouse.move(rect.x + 30, rect.y + 7);
  await page.mouse.down();
  await page.mouse.move(rect.x + 30 + dx, rect.y + 7 + dy, { steps: 10 });
  await page.mouse.up();
}
