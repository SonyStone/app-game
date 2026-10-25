/* global localStorage, document, getComputedStyle, console */
import { expect } from '@playwright/test';
import assert from 'node:assert/strict';

/** Checks migration recovery, action-label parity, edge collapse and mixed-kit placement in Chrome at 2× scale. */
export async function verifyWindowFixes(page, url, output) {
  await page.goto(`${url}/variants.html#lego`);
  await page.getByRole('button', { name: 'Edit', exact: true }).waitFor();
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
  const tile = page.getByRole('button', { name: 'Expand Layers', exact: true });
  await tile.waitFor();
  await page.screenshot({ path: `${output}/v2-toolbar-no-hole.png` });
  const labels = await page
    .locator('[data-window-tile] span, [data-part="file"] button span, [data-part="undo"] button span')
    .evaluateAll((labels) =>
      labels.map((label) => {
        const style = getComputedStyle(label);
        return { size: style.fontSize, weight: style.fontWeight, spacing: style.letterSpacing };
      })
    );
  assert.equal(labels.length, 3);
  assert.deepEqual(labels, [labels[0], labels[0], labels[0]], 'collapsed window labels match 2×1 action labels');
  await page.screenshot({ path: `${output}/collapsed-label-comparison.png` });

  const custom = [
    part('custom-undo', 'action:undo'),
    { ...part('custom-hex', 'color:hex', 0, 1), span: { columns: 3, rows: 1 }, future: 42 }
  ];
  await seed(page, 3, [
    toolbar,
    { id: 'custom-folder', owner: 'opener', at: { x: 0, y: 0 }, parts: custom, futureFolder: 17 }
  ]);
  await page.getByRole('button', { name: 'Expand Layers', exact: true }).click();
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
  const before = await edge.boundingBox();
  const at = (await savedPanel(page, 'edge')).at;
  await page.screenshot({ path: `${output}/edge-before.png` });
  await edge.getByRole('button', { name: 'Expand Edge', exact: true }).click();
  const expanded = await edge.boundingBox();
  assert.ok(expanded.x < before.x && expanded.y < before.y, 'edge expansion clamps into view');
  assert.deepEqual((await savedPanel(page, 'edge')).at, at, 'clamping does not change storage');
  await page.screenshot({ path: `${output}/edge-expanded.png` });
  await edge.getByRole('button', { name: 'Collapse Edge', exact: true }).click();
  assert.deepEqual((await savedPanel(page, 'edge')).at, at);
  const collapsed = await edge.boundingBox();
  assert.equal(Math.round(collapsed.x), Math.round(before.x));
  assert.equal(Math.round(collapsed.y), Math.round(before.y));
  await page.screenshot({ path: `${output}/edge-collapsed.png` });
  await edge.getByRole('button', { name: 'Expand Edge', exact: true }).click();
  const handle = await edge.locator('[data-window-handle]').boundingBox();
  await page.mouse.move(handle.x + 8, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x - 112, handle.y + handle.height / 2 - 80, { steps: 12 });
  await page.mouse.up();
  const moved = await edge.boundingBox();
  assert.ok(moved.x < expanded.x - 100);
  await edge.getByRole('button', { name: 'Collapse Edge', exact: true }).click();
  const movedTile = await edge.boundingBox();
  assert.equal(Math.round(movedTile.x), Math.round(moved.x));
  assert.equal(Math.round(movedTile.y), Math.round(moved.y));
  await page.screenshot({ path: `${output}/edge-dragged-collapse.png` });

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
    const window = page.getByRole('toolbar', { name: 'Kit Layers window', exact: true }).locator('..');
    await window.waitFor();
    const placed = page.locator('[data-part-kind="action:undo"]').locator('..').locator('..');
    await expect(placed).toHaveCount(1);
    await placed.evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
    await page.screenshot({ path: `${output}/mixed-kit-${join ? 'panel' : 'bare'}.png` });
    const blockRect = await placed.boundingBox();
    const windowRect = await window.boundingBox();
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
  console.log('PASS window fix regressions: recovery, gap compaction, labels, edge collapse, mixed kits');
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
