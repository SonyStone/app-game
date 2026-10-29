import { expect, test, type Locator, type Page } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createEditingSource } from '../tests/editingSource';

const pageErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
});
test.afterEach(({ page }) => {
  expect(pageErrors.get(page)).toEqual([]);
});

const screens = '/tmp/psd-viewer-edit-ux-screens';
const row = (page: Page, id: number) => page.locator(`[data-layer-index][data-edit-id="${id}"]`);
const revision = (page: Page, number: number) =>
  expect(page.getByLabel('Editor status')).toContainText(`Revision ${number}.`);

async function open(page: Page, fixture: string | null = 'source-host-rgb8') {
  await page.goto('/');
  const bytes = fixture
    ? await readFile(fileURLToPath(new URL(`../../../packages/psd/test/editor/${fixture}.psd`, import.meta.url)))
    : Buffer.from(await createEditingSource());
  await page
    .locator('input[accept=".psd,.psb"]')
    .setInputFiles({ name: 'tree.psd', mimeType: 'image/vnd.adobe.photoshop', buffer: bytes });
  await expect(page.locator('[data-busy]')).toHaveAttribute('data-render-id', /\d+/);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await revision(page, 0);
  await expect(page.getByRole('button', { name: 'Save as…' })).toBeEnabled();
  await mkdir(screens, { recursive: true });
}

async function drag(page: Page, source: Locator, target: Locator, fraction = 0.5, capture = false) {
  const from = (await source.boundingBox())!;
  const to = (await target.boundingBox())!;
  await page.mouse.move(from.x + from.width * 0.6, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width * 0.6, to.y + to.height * fraction, { steps: 8 });
  if (capture) {
    await expect(target).toHaveAttribute('data-drop-zone', /inside|before|after/);
    await page.screenshot({ path: `${screens}/drag-${fraction === 0.5 ? 'into-group' : 'reorder'}-indicator.png` });
  }
  await page.mouse.up();
}

// Mock only the native destination picker; edits, worker, writer, and streaming save are real.
async function picker(page: Page) {
  await page.addInitScript(() => {
    Reflect.set(window, '__saved', []);
    Reflect.set(window, 'showSaveFilePicker', async () => ({
      createWritable: async () => ({
        write: async (bytes: Uint8Array) => {
          Reflect.get(window, '__saved').push(...bytes);
        },
        close: async () => {},
        abort: async () => {}
      })
    }));
  });
}

async function save(page: Page, n: number) {
  await page.getByRole('button', { name: 'Save as…' }).click();
  await expect(page.getByLabel('Save status')).toContainText(`Saved revision ${n}`);
  return page.evaluate(() => Reflect.get(window, '__saved') as number[]);
}

test('inline rename cancels and commits; eye edits; scrub commits once; undo and redo use shortcuts', async ({
  page
}) => {
  await open(page);
  await row(page, 3).click();
  await page.screenshot({ path: `${screens}/edit-toolbar.png` });
  const name = row(page, 3).locator('span[title]').last();
  await name.dblclick();
  await page.getByLabel('Rename layer inline').fill('Canceled');
  await page.keyboard.press('Escape');
  await revision(page, 0);
  await name.dblclick();
  await page.getByLabel('Rename layer inline').fill('Tree rename');
  await page.screenshot({ path: `${screens}/inline-rename.png` });
  await page.keyboard.press('Enter');
  await revision(page, 1);
  await expect(row(page, 3)).toContainText('Tree rename');
  await row(page, 3).getByRole('checkbox').click();
  await revision(page, 2);
  await expect(row(page, 3).getByRole('checkbox')).not.toBeChecked();
  await page.keyboard.press('Meta+z');
  await revision(page, 3);
  await expect(row(page, 3).getByRole('checkbox')).toBeChecked();
  const scrub = page.getByTitle('Drag to change Opacity. Shift accelerates. Escape cancels.');
  const rect = (await scrub.boundingBox())!;
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width / 2 - 32, rect.y + rect.height / 2, { steps: 12 });
  await expect(page.getByLabel('Layer opacity percent')).toHaveValue('68');
  await revision(page, 3);
  await page.screenshot({ path: `${screens}/opacity-scrub.png` });
  await page.mouse.up();
  await revision(page, 4);
  await expect(page.getByLabel('Layer opacity percent')).toHaveValue('68');
  await page.getByRole('tree').focus();
  await page.keyboard.press('Control+z');
  await revision(page, 5);
  await expect(page.getByLabel('Layer opacity percent')).toHaveValue('100');
  await page.keyboard.press('Control+Shift+z');
  await revision(page, 6);
  await expect(page.getByLabel('Layer opacity percent')).toHaveValue('68');
});

test('tree drag moves into and out of a group and displays a group target', async ({ page }) => {
  await open(page, 'source-host-group');
  await page.getByRole('button', { name: 'Expand all', exact: true }).click();
  // Inspect the fixture's real persistent IDs through the UI, not a mocked tree.
  await expect(row(page, 4)).toBeVisible();
  const root = page.locator('[data-layer-index][data-edit-id]').filter({ has: page.getByRole('checkbox') });
  const info = await root.evaluateAll((nodes) =>
    nodes.map((node) => ({
      id: Number(node.getAttribute('data-edit-id')),
      level: Number(node.parentElement?.getAttribute('aria-level'))
    }))
  );
  const outside = info.find((item) => item.level === 1 && item.id !== 4)!;
  await drag(page, row(page, outside.id), row(page, 4), 0.5, true);
  await revision(page, 1);
  await expect(row(page, outside.id).locator('..')).toHaveAttribute('aria-level', '2');
  await drag(page, row(page, outside.id), row(page, 4), 0.1, true);
  await revision(page, 2);
  await expect(row(page, outside.id).locator('..')).toHaveAttribute('aria-level', '1');
});

test('multi-selection groups, ungroups, deletes and undoes with keyboard and context menu equivalents', async ({
  page
}) => {
  await open(page);
  await row(page, 3).click();
  await row(page, 2).click({ modifiers: ['Shift'] });
  await expect(page.getByRole('treeitem', { selected: true })).toHaveCount(2);
  await page.keyboard.press('Meta+g');
  await revision(page, 1);
  const group = page.locator('[data-layer-index]').filter({ has: page.locator('span[title="Group 1"]') });
  await group.click();
  await page.keyboard.press('Meta+Shift+g');
  await revision(page, 2);
  await expect(group).toHaveCount(0);
  await row(page, 3).click();
  await row(page, 2).click({ modifiers: ['Meta'] });
  await expect(page.getByRole('treeitem', { selected: true })).toHaveCount(2);
  await row(page, 2).click({ modifiers: ['Meta'] });
  await expect(page.getByRole('treeitem', { selected: true })).toHaveCount(1);
  await page.keyboard.press('Delete');
  await revision(page, 3);
  await expect(row(page, 3)).toHaveCount(0);
  await page.keyboard.press('Meta+z');
  await revision(page, 4);
  await row(page, 3).click({ button: 'right' });
  await page.getByRole('menuitem', { name: /Delete layers/ }).click();
  await revision(page, 5);
});

test('a refused eye edit restores its checkbox and displays a readable reason with expandable details', async ({
  page
}) => {
  await picker(page);
  await open(page, null);
  const eye = page.getByRole('tree').getByRole('checkbox');
  await eye.click();
  await expect(page.locator('[data-refusal-code]')).toContainText(/file|document|requires/i);
  await expect(eye).toBeChecked();
  await revision(page, 0);
  await page.screenshot({ path: `${screens}/refusal-reverted.png` });
  await page.getByText('Refusal details', { exact: true }).click();
  await expect(page.locator('[data-refusal-code]')).toContainText('Document and revision unchanged');
  await page.getByRole('tree').getByRole('treeitem').click();
  await page.getByLabel('Layer blend mode').selectOption('multiply');
  await expect(page.locator('[data-refusal-code]')).toBeVisible();
  await expect(page.getByLabel('Layer blend mode')).toHaveValue('normal');
  await page.getByLabel('Layer opacity percent').fill('50');
  await page.getByLabel('Layer opacity percent').press('Enter');
  await expect(page.getByLabel('Layer opacity percent')).toHaveValue('100');
  await page.getByRole('tree').locator('span[title="raster"]').dblclick();
  await page.getByLabel('Rename layer inline').fill('Refused name');
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Rename layer inline')).toHaveCount(0);
  await expect(page.getByRole('tree')).toContainText('raster');
  await revision(page, 0);
});

test('save after tree edits is byte-identical to the equivalent advanced form edits', async ({ page, context }) => {
  // Same truthful clock/UUID operands for both paths, without changing production save semantics.
  await context.route('**/features/editing/{contracts,makeEditingSession}.ts*', async (route) => {
    const response = await route.fetch();
    // Freeze only the edit operands; Vite's transport and browser clocks stay real.
    const source = (await response.text())
      .replaceAll('crypto.randomUUID()', '__editUuid()')
      .replaceAll('new Date()', "new Date('2026-10-28T10:00:00Z')");
    const uuid =
      "let __editId = 0; function __editUuid() { return '00000000-0000-4000-8000-' + String(++__editId).padStart(12, '0'); }";
    await route.fulfill({ response, body: `${uuid}\n${source}` });
  });
  await picker(page);
  await open(page);
  await row(page, 3).locator('span[title]').last().dblclick();
  await page.getByLabel('Rename layer inline').fill('Same edit');
  await page.keyboard.press('Enter');
  await revision(page, 1);
  await row(page, 3).click();
  await page.getByLabel('Layer opacity percent').fill('68');
  await page.getByLabel('Layer opacity percent').press('Enter');
  await revision(page, 2);
  const direct = await save(page, 2);
  await open(page);
  await page.getByText('Advanced', { exact: true }).click();
  await page.getByLabel('Edit layer', { exact: true }).selectOption('3');
  await page.getByLabel('Layer name', { exact: true }).fill('Same edit');
  await page.getByRole('button', { name: 'Rename layer', exact: true }).click();
  await revision(page, 1);
  await page.getByLabel('Edit opacity', { exact: true }).fill('173');
  await page.getByRole('button', { name: 'Apply opacity', exact: true }).click();
  await revision(page, 2);
  expect(await save(page, 2)).toEqual(direct);
});

test('context menu groups and ungroups; Fill and blend edit; a multi-layer opacity refusal rolls back', async ({
  page
}) => {
  await open(page);
  await row(page, 3).click({ button: 'right' });
  await page.getByRole('menuitem', { name: /Group layers/ }).click();
  await revision(page, 1);
  const group = page.locator('[data-layer-index]').filter({ has: page.locator('span[title="Group 1"]') });
  await group.click({ button: 'right' });
  await page.getByRole('menuitem', { name: /^Ungroup/ }).click();
  await revision(page, 2);
  await row(page, 3).click();
  await page.getByLabel('Layer fill percent').fill('68');
  await page.getByLabel('Layer fill percent').press('Enter');
  await revision(page, 3);
  await page.getByLabel('Layer blend mode').selectOption('multiply');
  await revision(page, 4);
  await row(page, 3).click();
  await row(page, 2).click({ modifiers: ['Meta'] });
  await page.getByLabel('Layer opacity percent').fill('50');
  await page.getByLabel('Layer opacity percent').press('Enter');
  await expect(page.locator('[data-refusal-code]')).toContainText(/localized labels/);
  await revision(page, 4);
  await expect(page.getByLabel('Layer opacity percent')).toHaveValue('100');
  await expect(row(page, 3)).toContainText('100%');
  await expect(row(page, 2)).toContainText('100%');
});

test('viewing eye overrides clear on entering Edit; saved eye edits remain when returning to View', async ({
  page
}) => {
  await open(page);
  const edit = page.getByRole('button', { name: 'Edit', exact: true });
  await edit.click();
  await row(page, 3).getByRole('checkbox').click();
  await expect(row(page, 3).getByRole('checkbox')).not.toBeChecked();
  await expect(page.getByText(/View mode · eye changes are transient/)).toBeVisible();
  await edit.click();
  await revision(page, 0);
  await expect(row(page, 3).getByRole('checkbox')).toBeChecked();
  await expect(page.getByRole('button', { name: 'Solo', exact: true })).toBeDisabled();
  await row(page, 3).getByRole('checkbox').click();
  await revision(page, 1);
  await edit.click();
  await expect(row(page, 3).getByRole('checkbox')).not.toBeChecked();
});
