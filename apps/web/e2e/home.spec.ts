import { expect, test, type Page } from '@playwright/test';

/** A folder tile on the start page, by its label. */
function folderTile(page: Page, name: string) {
  return page.locator(`a[aria-label^="${name}, folder of"]`);
}

/** The folder open in place, if any. */
function panel(page: Page) {
  return page.locator('[data-folder-panel]');
}

async function openFolder(page: Page, name: string, path: string) {
  await folderTile(page, name).click();
  await expect(page).toHaveURL(path);
  await expect(panel(page)).toHaveAttribute('data-folder-panel', path);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(folderTile(page, 'Paint')).toBeVisible();
});

test('opens a folder in place at its own address, in place of its tile', async ({ page }) => {
  await openFolder(page, 'WebGL', '/webgl-examples');

  await expect(panel(page)).toBeInViewport();
  await expect(panel(page).getByRole('heading', { name: 'WebGL' })).toBeVisible();
  await expect(folderTile(page, 'WebGL')).toHaveCount(0);
  await expect(folderTile(page, 'Paint')).toBeVisible();
});

test('Back steps through the folders opened, then closes the last', async ({ page }) => {
  await openFolder(page, 'WebGPU', '/webgpu-examples');
  await openFolder(page, 'WASM', '/wasm');
  await openFolder(page, 'Math', '/math');

  await page.goBack();
  await expect(panel(page)).toHaveAttribute('data-folder-panel', '/wasm');
  await page.goBack();
  await expect(panel(page)).toHaveAttribute('data-folder-panel', '/webgpu-examples');
  await page.goBack();
  await expect(page).toHaveURL('/');
  await expect(panel(page)).toHaveCount(0);

  await page.goForward();
  await expect(panel(page)).toHaveAttribute('data-folder-panel', '/webgpu-examples');
});

test('the close button returns to the start page past every folder opened', async ({ page }) => {
  await openFolder(page, 'Math', '/math');
  await openFolder(page, 'OGL', '/ogl-examples');

  await page.getByRole('button', { name: 'Close folder' }).click();

  await expect(page).toHaveURL('/');
  await expect(panel(page)).toHaveCount(0);
  await expect(folderTile(page, 'OGL')).toBeVisible();
});

test("a folder's address opens it on the start page, scrolled into view", async ({ page }) => {
  await page.goto('/webgl-examples');

  await expect(panel(page)).toHaveAttribute('data-folder-panel', '/webgl-examples');
  await expect(panel(page)).toBeInViewport();

  await page.getByRole('button', { name: 'Close folder' }).click();
  await expect(page).toHaveURL('/');
  await expect(folderTile(page, 'WebGL')).toBeInViewport();
});

test('Back from a page inside a folder returns to the open folder', async ({ page }) => {
  await openFolder(page, 'Math', '/math');
  await panel(page).locator('a[aria-label]').first().click();
  await expect(page).toHaveURL(/\/math\/.+/);

  await page.goBack();

  await expect(panel(page)).toHaveAttribute('data-folder-panel', '/math');
});

test("tiles inside an open folder keep to the start page's columns", async ({ page }) => {
  // Without entrance animations and the morph, the tiles stand where they settle.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openFolder(page, 'UI / UX', '/ui-components-examples');

  const layout = await page.evaluate(() => {
    const opened = document.querySelector('[data-folder-panel]')!;
    const tiles = [...document.querySelectorAll<HTMLElement>('a[aria-label]')];
    const left = (tile: HTMLElement) => Math.round(tile.getBoundingClientRect().left);
    const width = (tile: HTMLElement | undefined) => tile && Math.round(tile.getBoundingClientRect().width);
    const inside = tiles.filter((tile) => opened.contains(tile));
    const outside = tiles.filter((tile) => !opened.contains(tile));
    const columns = new Set(outside.map(left));

    return {
      offGrid: inside.map(left).filter((x) => !columns.has(x)),
      smallInside: width(inside.find((tile) => tile.className.includes('small'))),
      smallOutside: width(outside.find((tile) => tile.className.includes('small')))
    };
  });

  expect(layout.offGrid).toEqual([]);
  expect(layout.smallInside).toBe(layout.smallOutside);
});
