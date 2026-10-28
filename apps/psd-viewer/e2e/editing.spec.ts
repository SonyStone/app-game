import { readPsd } from '@app-game/psd';
import { openPsdEditor } from '@app-game/psd/editor';
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createEditingSource } from '../tests/editingSource';

async function open(page: Page, fixture?: string) {
  await page.goto('/');
  const bytes = fixture
    ? new Uint8Array(
        await readFile(fileURLToPath(new URL(`../../../packages/psd/test/editor/${fixture}.psd`, import.meta.url)))
      )
    : await createEditingSource();
  await page
    .locator('input[accept=".psd,.psb"]')
    .setInputFiles({ name: 'honest.psd', mimeType: 'image/vnd.adobe.photoshop', buffer: Buffer.from(bytes) });
  await expect(page.locator('[data-busy]')).toHaveAttribute('data-render-id', /\d+/);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByLabel('Editor status')).toContainText('Revision 0.');
  await expect(page.getByRole('button', { name: 'Save as…' })).toBeEnabled();
  await page.getByText('Advanced', { exact: true }).click();
  await page.getByText('File Info and resolution', { exact: true }).first().click();
  return bytes;
}

/** Native-picker mock exercises our real streaming UI without attempting to automate an OS modal. */
async function picker(page: Page, outcome: 'success' | 'cancel' | 'write-failure' | 'hold' = 'success') {
  await page.addInitScript((outcome) => {
    const state = { events: [] as string[], bytes: [] as number[][], resume: undefined as (() => void) | undefined };
    Reflect.set(window, '__saveTest', state);
    Reflect.set(window, 'showSaveFilePicker', async () => {
      state.events.push('picker');
      if (outcome === 'cancel') {
        throw new DOMException('Canceled by user', 'AbortError');
      }
      if (outcome === 'hold') {
        await new Promise<void>((resolve) => {
          state.resume = resolve;
        });
      }
      return {
        async createWritable() {
          return {
            async write(bytes: Uint8Array) {
              state.events.push('write');
              if (outcome === 'write-failure') {
                throw new Error('disk full');
              }
              state.bytes.push([...bytes]);
            },
            async close() {
              state.events.push('close');
            },
            async abort() {
              state.events.push('abort');
              state.bytes = [];
            }
          };
        }
      };
    });
  }, outcome);
}

test('v5 rename and opacity refresh pixels and layers; undo/redo restore the exact saved revisions', async ({
  page
}) => {
  await picker(page);
  const bytes = await open(page, 'source-host-rgb8');
  const canvas = page.locator('[data-busy]');
  const render = await canvas.getAttribute('data-render-id');
  await page.getByLabel('Edit layer', { exact: true }).selectOption('3');
  await page.getByLabel('Layer name', { exact: true }).fill('Honest rename');
  await page.getByRole('button', { name: 'Rename layer', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-editor-revision', '1');
  await expect(canvas).not.toHaveAttribute('data-render-id', render!);
  await expect(page.getByLabel('How to save')).toHaveValue('source');
  await expect(page.getByLabel('How to save').locator('option')).toHaveText(["Keep the source's settings"]);
  await expect(page.getByLabel('Blend RGB colors using gamma 1', { exact: true })).not.toBeChecked();
  await expect(page.getByLabel('Edit layer', { exact: true }).locator('option:checked')).toContainText('Honest rename');
  await page.getByLabel('Edit opacity', { exact: true }).fill('173');
  await page.getByRole('button', { name: 'Apply opacity', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-editor-revision', '2');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-editor-revision', '3');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-editor-revision', '4');
  await page.getByRole('button', { name: 'Save as…' }).click();
  await expect(page.getByLabel('Save status')).toContainText('Saved revision 4');
  const saved = await page.evaluate(() => Reflect.get(window, '__saveTest').bytes.flat());
  const session = await openPsdEditor(Uint8Array.from(saved));
  expect(session.ok).toBe(true);
  if (session.ok) {
    expect((await readPsd(Uint8Array.from(saved))).layers.some((layer) => layer.name === 'Honest rename')).toBe(true);
    session.value.dispose();
  }
  await page.getByText('Export and original download', { exact: true }).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download unchanged original', exact: true }).click();
  const download = await downloaded;
  expect(new Uint8Array(await readFile((await download.path())!))).toEqual(bytes);
});

test('reorders fallback source layers bottom to top through a real drag and saves the changed stack', async ({
  page
}) => {
  await picker(page);
  await open(page, 'source-host-rgb8');
  await page.getByText('Reorder by drag and group selection', { exact: true }).click();
  const rows = page.locator('[data-edit-layer-id]');
  await expect
    .poll(() => rows.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-edit-layer-id'))))
    .toEqual(['2', '3']);
  await rows.nth(1).dragTo(rows.first());
  await expect(page.getByLabel('Editor status')).toContainText('Revision 1.');
  await expect
    .poll(() => rows.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-edit-layer-id'))))
    .toEqual(['3', '2']);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByLabel('Editor status')).toContainText('Revision 2.');
  await expect
    .poll(() => rows.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-edit-layer-id'))))
    .toEqual(['2', '3']);
});

test('groups selected raster layers and ungroups saved groups, with undo restoring source order', async ({ page }) => {
  await open(page, 'source-host-rgb8');
  await page.getByText('Reorder by drag and group selection', { exact: true }).click();
  await page.locator('[data-edit-layer-id="3"] input').check();
  await page.getByLabel('Group name', { exact: true }).fill('Browser group');
  await page.getByRole('button', { name: 'Group selected layers', exact: true }).click();
  await expect(page.getByLabel('Editor status')).toContainText('Revision 1.');
  await expect(page.getByLabel('Edit layer', { exact: true })).toContainText('Browser group');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByLabel('Editor status')).toContainText('Revision 2.');
  await expect(page.getByLabel('Edit layer', { exact: true })).not.toContainText('Browser group');

  await page
    .locator('input[accept=".psd,.psb"]')
    .setInputFiles(fileURLToPath(new URL('../../../packages/psd/test/editor/source-host-group.psd', import.meta.url)));
  await expect(page.getByLabel('Editor status')).toHaveCount(0);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save as…' })).toBeEnabled();
  await page.getByText('Advanced', { exact: true }).click();
  await page.getByLabel('Edit layer', { exact: true }).selectOption('4');
  await page.getByRole('button', { name: 'Ungroup layer', exact: true }).click();
  await expect(page.getByLabel('Editor status')).toContainText('Revision 1.');
  await expect(page.getByLabel('Edit layer', { exact: true }).locator('option[value="4"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByLabel('Editor status')).toContainText('Revision 2.');
  await expect(page.getByLabel('Edit layer', { exact: true }).locator('option[value="4"]')).toHaveCount(1);
});

test('an uninitialized source refusal keeps revision, pixels and saved bytes unchanged and explains its dependency', async ({
  page
}) => {
  await picker(page);
  const original = await open(page);
  const canvas = page.locator('[data-busy]');
  const render = await canvas.getAttribute('data-render-id');
  await page.getByLabel('Edit layer', { exact: true }).selectOption({ index: 1 });
  await page.getByLabel('Layer name', { exact: true }).fill('Refused');
  await page.getByRole('button', { name: 'Rename layer', exact: true }).click();
  await expect(page.locator('[data-refusal-code]')).toHaveAttribute('data-refusal-code', 'Dependency');
  await expect(page.locator('[data-refusal-code]')).toContainText(/file|document|requires/i);
  await expect(canvas).toHaveAttribute('data-editor-revision', '0');
  await expect(canvas).toHaveAttribute('data-render-id', render!);
  await page.getByRole('button', { name: 'Save as…' }).click();
  await expect(page.getByLabel('Save status')).toContainText('Saved revision 0');
  expect(await page.evaluate(() => Reflect.get(window, '__saveTest').bytes.flat())).toEqual([...original]);
});

test('bounded File Info public domain saves with the honest agent', async ({ page }) => {
  await picker(page);
  await open(page, 'metadata');
  await page.getByRole('button', { name: 'Apply copyright', exact: true }).click();
  await expect(page.getByLabel('Editor status')).toContainText('Revision 1.');
  await page.getByRole('button', { name: 'Save as…' }).click();
  await expect(page.getByLabel('Save status')).toContainText('Saved revision 1');
  const bytes = Uint8Array.from(await page.evaluate(() => Reflect.get(window, '__saveTest').bytes.flat()));
  expect(new TextDecoder().decode(bytes)).toContain('PSD Viewer');
  const opened = await openPsdEditor(bytes);
  expect(opened.ok).toBe(true);
  if (opened.ok) {
    opened.value.dispose();
  }
});

test('untouched download saves byte-identically and new source discards editor state', async ({ page }) => {
  await page.addInitScript(() => {
    Reflect.set(window, 'showSaveFilePicker', undefined);
  });
  const source = await open(page);
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save as…' }).click();
  const download = await downloaded;
  expect(new Uint8Array(await readFile((await download.path())!))).toEqual(source);
  await page
    .locator('input[accept=".psd,.psb"]')
    .setInputFiles({ name: 'next.psd', mimeType: 'image/vnd.adobe.photoshop', buffer: Buffer.from(source) });
  await expect(page.getByLabel('Editor status')).toHaveCount(0);
  await expect(page.locator('[data-busy]')).toHaveAttribute('data-editor-revision', '0');
});

for (const outcome of ['cancel', 'write-failure'] as const) {
  test(`native picker ${outcome} releases the frozen save for a retry`, async ({ page }) => {
    await picker(page, outcome);
    await open(page);
    await page.getByRole('button', { name: 'Save as…' }).click();
    await expect(page.getByLabel('Save status')).toContainText(outcome === 'cancel' ? 'Save canceled' : 'Save failed');
    await page.evaluate(() => {
      Reflect.set(window, 'showSaveFilePicker', async () => ({
        async createWritable() {
          return { async write() {}, async close() {}, async abort() {} };
        }
      }));
    });
    await page.getByRole('button', { name: 'Save as…' }).click();
    await expect(page.getByLabel('Save status')).toContainText('Saved revision 0');
  });
}

test('a frozen save survives later edits; explicit cancel releases it', async ({ page }) => {
  await picker(page, 'hold');
  const original = await open(page);
  await page.getByRole('button', { name: 'Save as…' }).click();
  await expect(page.getByLabel('Save status')).toContainText('Choose a destination');
  await page.getByLabel('Resolution ppi').fill('144');
  await page.getByRole('button', { name: 'Apply resolution' }).click();
  await expect(page.locator('[data-busy]')).toHaveAttribute('data-editor-revision', '1');
  await page.evaluate(() => Reflect.get(window, '__saveTest').resume());
  await expect(page.getByLabel('Save status')).toContainText('Saved revision 0');
  expect(await page.evaluate(() => Reflect.get(window, '__saveTest').bytes.flat())).toEqual([...original]);
  await page.getByRole('button', { name: 'Save as…' }).click();
  await expect(page.getByLabel('Save status')).toContainText('Choose a destination');
  await page.getByRole('button', { name: 'Cancel save' }).click();
  await page.evaluate(() => Reflect.get(window, '__saveTest').resume());
  await expect(page.getByLabel('Save status')).toContainText('Save canceled');
});
