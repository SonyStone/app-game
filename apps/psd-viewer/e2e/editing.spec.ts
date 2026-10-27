import { openPsdEditor } from '@app-game/psd/editor';
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createEditingSource } from '../tests/editingSource';

async function open(page: Page) {
  await page.goto('/');
  const bytes = await createEditingSource();
  await page
    .locator('input[accept=".psd,.psb"]')
    .setInputFiles({ name: 'honest.psd', mimeType: 'image/vnd.adobe.photoshop', buffer: Buffer.from(bytes) });
  await expect(page.locator('[data-busy]')).toHaveAttribute('data-render-id', /\d+/);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByLabel('Editor status')).toContainText('Revision 0.');
  await expect(page.getByRole('button', { name: 'Save as…' })).toBeEnabled();
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

test('guarded edit refusals preserve revision, original and render; metadata undo/redo retain pixel content', async ({
  page
}) => {
  await picker(page);
  const bytes = await open(page);
  const canvas = page.locator('[data-busy]');
  const render = await canvas.getAttribute('data-render-id');
  await page.getByLabel('Edit layer', { exact: true }).selectOption({ index: 1 });
  await page.getByLabel('Layer name', { exact: true }).fill('Honest rename');
  await page.getByRole('button', { name: 'Rename layer', exact: true }).click();
  await expect(page.locator('[data-refusal-code]')).toHaveAttribute('data-refusal-code', 'HostAttributionRequired');
  await expect(page.locator('[data-refusal-code]')).toContainText('save.softwareAgent');
  await expect(canvas).toHaveAttribute('data-editor-revision', '0');
  await expect(canvas).toHaveAttribute('data-render-id', render!);
  await page.getByLabel('Resolution ppi').fill('144');
  await page.getByRole('button', { name: 'Apply resolution', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-editor-revision', '1');
  await expect(canvas).toHaveAttribute('data-render-id', render!);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-editor-revision', '2');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-editor-revision', '3');
  await page.getByRole('button', { name: 'Save as…' }).click();
  await expect(page.getByLabel('Save status')).toContainText('Saved revision 3');
  const saved = await page.evaluate(() => Reflect.get(window, '__saveTest').bytes.flat());
  const session = await openPsdEditor(Uint8Array.from(saved));
  expect(session.ok).toBe(true);
  if (session.ok) {
    expect(session.value.inspectProcess()).toMatchObject({ ok: true, value: { layers: [{ layerId: 2 }] } });
    session.value.dispose();
  }
  await page.getByText('Export and original download', { exact: true }).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download unchanged original', exact: true }).click();
  const download = await downloaded;
  expect(new Uint8Array(await readFile((await download.path())!))).toEqual(bytes);
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
