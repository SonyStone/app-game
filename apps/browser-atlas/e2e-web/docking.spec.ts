import { expect, test, type Locator, type Page } from '@playwright/test';

const LAYOUT_STORAGE_KEY = 'browserAtlas.layout.v1';
const MOCK_TREE_STORAGE_KEY = 'browserAtlas.mockTree.v2';
/** Point on a row's title; the blank space right of it starts a marquee selection instead of a drag. */
const ROW_TITLE_POSITION = { x: 48, y: 10 };

test('opens, closes and stores explorers, their views and the primary explorer', async ({ page }) => {
  await page.goto('/browser-atlas');
  const explorers = page.getByRole('region', { name: /^Explorer \d+$/u });
  const third = page.getByRole('region', { name: 'Explorer 3' });
  await expect(explorers).toHaveCount(2);
  await expect(dockTab(page, 'explorer-1').getByRole('button', { name: 'Primary explorer' })).toHaveAttribute(
    'aria-pressed',
    'true'
  );

  await page.getByRole('button', { name: 'New explorer' }).click();
  await expect(third.getByRole('tab', { name: 'Explore' })).toHaveAttribute('aria-selected', 'true');
  await third.getByRole('combobox', { name: 'Explorer data source' }).selectOption({ label: 'Firefox (mock)' });
  await third.getByRole('tab', { name: 'History' }).click();
  await expect(dockTab(page, 'explorer-3')).toHaveAccessibleName('Firefox (mock) · History');

  await closePanelTab(page, 'explorer-2');
  await expect(page.getByRole('region', { name: 'Explorer 2' })).toHaveCount(0);
  await dockTab(page, 'explorer-3').getByRole('button', { name: 'Make primary explorer' }).click();
  await expect(dockTab(page, 'explorer-3').getByRole('button', { name: 'Primary explorer' })).toBeVisible();
  await expect(dockTab(page, 'explorer-1').getByRole('button', { name: 'Make primary explorer' })).toBeVisible();
  await expect
    .poll(() => readStoredLayout(page))
    .toMatchObject({
      primary: 'explorer-3',
      explorers: { 'explorer-3': { backend: 'browser:firefox', source: 'history' } }
    });

  await page.reload();
  await expect(explorers).toHaveCount(2);
  await expect(page.getByRole('region', { name: 'Explorer 2' })).toHaveCount(0);
  await expect(third.getByRole('combobox', { name: 'Explorer data source' }).locator('option:checked')).toHaveText(
    'Firefox (mock)'
  );
  await expect(third.getByRole('tab', { name: 'History' })).toHaveAttribute('aria-selected', 'true');
  await expect(dockTab(page, 'explorer-3').getByRole('button', { name: 'Primary explorer' })).toBeVisible();

  // A new explorer takes the smallest free number; Pop out opens the same layout.
  await page.getByRole('button', { name: 'New explorer' }).click();
  await expect(page.getByRole('region', { name: 'Explorer 2' })).toBeVisible();
  await expect
    .poll(async () => Object.keys((await readStoredLayout(page))?.explorers ?? {}).sort())
    .toEqual(['explorer-1', 'explorer-2', 'explorer-3']);
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Pop out', exact: true }).click();
  const popup = await popupPromise;
  await expect(popup.getByRole('region', { name: /^Explorer \d+$/u })).toHaveCount(3);
  await popup.close();
});

test('reopens an explorer from the empty workspace and resets the layout', async ({ page }) => {
  await page.goto('/browser-atlas');
  await closePanelTab(page, 'explorer-1');
  await closePanelTab(page, 'explorer-2');
  await expect(page.getByRole('region', { name: /^Explorer \d+$/u })).toHaveCount(0);

  await page.getByRole('button', { name: 'Open an explorer' }).click();
  const first = page.getByRole('region', { name: 'Explorer 1' });
  await expect(first.locator('[data-node-id="explore-window-1001"]')).toBeVisible();
  await expect(dockTab(page, 'explorer-1').getByRole('button', { name: 'Primary explorer' })).toBeVisible();

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Reset panel layout' }).click();
  await expect(page.getByRole('region', { name: 'Browser Atlas settings' })).toHaveCount(0);
  await expect(
    page.getByRole('region', { name: 'Explorer 2' }).getByRole('tab', { name: 'Bookmarks' })
  ).toHaveAttribute('aria-selected', 'true');
});

test('fits a layout stored in a wide window into a narrow one', async ({ page }) => {
  await page.goto('/browser-atlas');
  for (let index = 0; index < 3; index += 1) {
    await page.getByRole('button', { name: 'New explorer' }).click();
  }
  // Each new explorer gets the average width instead of half of its neighbour.
  const widths = await Promise.all(
    (await page.getByRole('region', { name: /^Explorer \d+$/u }).all()).map(
      async (explorer) => (await boxOf(explorer)).width
    )
  );
  expect(widths).toHaveLength(5);
  expect(Math.max(...widths) - Math.min(...widths)).toBeLessThan(4);
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect.poll(async () => Object.keys((await readStoredLayout(page))?.explorers ?? {}).length).toBe(5);

  await page.setViewportSize({ width: 640, height: 480 });
  await page.reload();
  const panels = page.locator('[data-dock-panel]');
  await expect(panels).toHaveCount(6);
  for (const panel of await panels.all()) {
    const box = await boxOf(panel);
    expect(box.width).toBeGreaterThan(40);
    expect(box.x + box.width).toBeLessThanOrEqual(640);
  }
});

test('docks explorers by dragging their tabs while tree rows keep native drag and drop', async ({ page }) => {
  await page.goto('/browser-atlas');
  const left = page.getByRole('region', { name: 'Explorer 1' });
  const right = page.getByRole('region', { name: 'Explorer 2' });
  const groups = page.locator('[data-dock-group]');
  await right.getByRole('tab', { name: 'Explore' }).click();

  await dragTabTo(page, 'explorer-2', await centerOf(left));
  await expect(groups).toHaveCount(1);
  await expect(dockTab(page, 'explorer-2')).toHaveAttribute('aria-selected', 'true');
  await expect(left).toBeHidden();
  await dockTab(page, 'explorer-1').click();
  await expect(left).toBeVisible();
  await expect(right).toBeHidden();

  const leftBox = await boxOf(left);
  await dragTabTo(page, 'explorer-2', { x: leftBox.x + leftBox.width / 2, y: leftBox.y + leftBox.height - 8 });
  await expect(groups).toHaveCount(2);
  await expect(right).toBeVisible();
  expect((await boxOf(right)).y).toBeGreaterThan((await boxOf(left)).y + 40);

  const sourceTab = left.locator('[data-node-id="explore-tab-2002"]');
  const targetWindow = right.locator('[data-node-id="explore-window-1002"]');
  await sourceTab.dragTo(targetWindow, { sourcePosition: ROW_TITLE_POSITION, targetPosition: { x: 48, y: 10 } });
  await expect.poll(() => readMockTabWindow(page, 'mock-live-tab-solid')).toBe(1002);
  await expect(groups).toHaveCount(2);

  await expect.poll(async () => Object.keys((await readStoredLayout(page))?.dock.nodes ?? {}).length).toBe(3);
  await page.reload();
  await expect(groups).toHaveCount(2);
  expect((await boxOf(right)).y).toBeGreaterThan((await boxOf(left)).y + 40);
});

test('opens a background explorer tab while a tree row is dragged over it', async ({ page }) => {
  await page.goto('/browser-atlas');
  const left = page.getByRole('region', { name: 'Explorer 1' });
  const right = page.getByRole('region', { name: 'Explorer 2' });
  await right.getByRole('tab', { name: 'Explore' }).click();
  await page.getByRole('button', { name: 'New explorer' }).click();
  const third = page.getByRole('region', { name: 'Explorer 3' });
  await expect(third.locator('[data-node-id="explore-tab-2002"]')).toBeVisible();
  await dragTabTo(page, 'explorer-2', await centerOf(left));
  await dockTab(page, 'explorer-1').click();
  await expect(right).toBeHidden();

  const row = await boxOf(third.locator('[data-node-id="explore-tab-2002"]'));
  await page.mouse.move(row.x + ROW_TITLE_POSITION.x, row.y + ROW_TITLE_POSITION.y);
  await page.mouse.down();
  const tab = await centerOf(dockTab(page, 'explorer-2'));
  await page.mouse.move(tab.x, tab.y, { steps: 8 });
  await expect(right).toBeVisible();
  const target = await boxOf(right.locator('[data-node-id="explore-window-1002"]'));
  await page.mouse.move(target.x + 48, target.y + 10, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => readMockTabWindow(page, 'mock-live-tab-solid')).toBe(1002);
});

test('opens Settings and service panels as tabs of one utility group', async ({ page }) => {
  await page.goto('/browser-atlas');
  const settingsButton = page.getByRole('button', { name: 'Settings' });
  const settings = page.getByRole('region', { name: 'Browser Atlas settings' });
  const deleted = page.getByRole('region', { name: 'Deleted items history' });
  const right = page.getByRole('region', { name: 'Explorer 2' });

  await settingsButton.click();
  await expect(settingsButton).toHaveAttribute('aria-pressed', 'true');
  await expect(settings).toBeVisible();
  expect((await boxOf(settings)).x).toBeGreaterThan((await boxOf(right)).x);

  await page.getByRole('region', { name: 'Explorer 1' }).getByTitle('Browse and restore deleted hierarchies').click();
  await expect(deleted).toBeVisible();
  await expect(settings).toBeHidden();
  await expect(page.locator('[data-dock-group]')).toHaveCount(3);
  await expect(settingsButton).toHaveAttribute('aria-pressed', 'false');

  // Settings behind another tab is shown first; a visible one closes.
  await settingsButton.click();
  await expect(settings).toBeVisible();
  await settingsButton.click();
  await expect(settings).toHaveCount(0);
  await expect(deleted).toBeVisible();
});

test('reveals extension-requested windows in the primary explorer, even behind another tab', async ({ page }) => {
  await page.goto('/browser-atlas');
  const left = page.getByRole('region', { name: 'Explorer 1' });
  const right = page.getByRole('region', { name: 'Explorer 2' });
  await dockTab(page, 'explorer-2').getByRole('button', { name: 'Make primary explorer' }).click();
  await dragTabTo(page, 'explorer-1', await centerOf(right));
  await expect(right).toBeHidden();
  await expect.poll(() => readStoredLayout(page)).toMatchObject({ primary: 'explorer-2' });
  await expect.poll(async () => Object.keys((await readStoredLayout(page))?.dock.nodes ?? {}).length).toBe(1);

  await page.goto('/browser-atlas?focusWindowId=1002');
  await expect(right.getByRole('tab', { name: 'Explore' })).toHaveAttribute('aria-selected', 'true');
  await expect(right.locator('[data-node-id="explore-window-1002"]')).toBeFocused();
  await expect(left).toBeHidden();
});

function dockTab(page: Page, panelId: string): Locator {
  return page.locator(`[data-dock-tab="${panelId}"]`);
}

async function closePanelTab(page: Page, panelId: string): Promise<void> {
  await dockTab(page, panelId).getByRole('button', { name: 'Close panel' }).click();
}

/** Drags a dock tab with the pointer, past the drag threshold, and releases it at `target`. */
async function dragTabTo(page: Page, panelId: string, target: { x: number; y: number }): Promise<void> {
  const start = await centerOf(dockTab(page, panelId));
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 12, start.y + 12, { steps: 3 });
  await page.mouse.move(target.x, target.y, { steps: 12 });
  await page.mouse.up();
}

async function boxOf(locator: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error('The element has no layout box.');
  }
  return box;
}

async function centerOf(locator: Locator): Promise<{ x: number; y: number }> {
  const box = await boxOf(locator);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

type StoredLayout = {
  dock: { nodes: Record<string, unknown> };
  explorers: Record<string, { backend: string; source: string }>;
  primary?: string;
};

async function readStoredLayout(page: Page): Promise<StoredLayout | null> {
  return page.evaluate((storageKey) => {
    const serialized = localStorage.getItem(storageKey);
    return serialized ? (JSON.parse(serialized) as StoredLayout) : null;
  }, LAYOUT_STORAGE_KEY);
}

async function readMockTabWindow(page: Page, persistentTabId: string): Promise<number | null> {
  return page.evaluate(
    ({ storageKey, tabId }) => {
      const serialized = localStorage.getItem(storageKey);
      const document: unknown = serialized ? JSON.parse(serialized) : null;
      if (
        typeof document !== 'object' ||
        document === null ||
        !('roots' in document) ||
        !Array.isArray(document.roots)
      ) {
        return null;
      }
      return findTabWindow(document.roots);

      function findTabWindow(nodes: unknown[]): number | null {
        for (const node of nodes) {
          if (typeof node !== 'object' || node === null || !('id' in node) || !('children' in node)) {
            continue;
          }
          if (node.id === tabId && 'binding' in node && typeof node.binding === 'object' && node.binding !== null) {
            return 'windowId' in node.binding && typeof node.binding.windowId === 'number'
              ? node.binding.windowId
              : null;
          }
          if (Array.isArray(node.children)) {
            const descendant = findTabWindow(node.children);
            if (descendant !== null) {
              return descendant;
            }
          }
        }
        return null;
      }
    },
    { storageKey: MOCK_TREE_STORAGE_KEY, tabId: persistentTabId }
  );
}
