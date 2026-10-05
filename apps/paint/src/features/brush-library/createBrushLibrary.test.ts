// @vitest-environment jsdom
import type { BrushResource } from '@app-game/abr-paint/resources';
import 'fake-indexeddb/auto';
import { createRoot, flush } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import type { BrushPreset } from './brushPresets';
import { createBrushLibrary } from './createBrushLibrary';
import { createBrushStorage } from './createBrushStorage';

const disposers: (() => void)[] = [];
afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
});

it('stores user presets and loads them lazily, one at a time or as a list, without their images', async () => {
  const name = crypto.randomUUID();
  const first = open(name);
  const ink = first.library.add(preset('Ink', ['tip']), [image('tip')]);
  const imported = await first.library.importPreset({ ...preset('Imported'), source: 'abr:1' }, [image('abr')]);
  const marker = first.library.add(preset('Marker'));
  first.library.update(ink.id, { name: 'Fine ink' });
  first.library.remove(marker.id);
  // Importing the same source again replaces the earlier import in place.
  const replaced = await first.library.importPreset({ ...preset('Imported again'), source: 'abr:1' }, [image('abr')]);
  expect(replaced.id).toBe(imported.id);
  flush();
  expect(first.library.presets().map(({ name }) => name)).toEqual([
    'Soft round',
    'Eraser',
    'Fine ink',
    'Imported again'
  ]);
  await first.storage.idle();

  const second = open(name);
  const readResources = vi.spyOn(second.storage, 'readResources');
  expect(second.library.find(ink.id)).toBeUndefined();
  expect((await second.library.load(ink.id))?.name).toBe('Fine ink');
  flush();
  expect(second.library.presets().map(({ name }) => name)).toEqual(['Soft round', 'Eraser', 'Fine ink']);
  await second.library.loadAll();
  flush();
  expect(second.library.presets().map(({ name }) => name)).toEqual([
    'Soft round',
    'Eraser',
    'Fine ink',
    'Imported again'
  ]);
  expect(readResources).not.toHaveBeenCalled();

  const resources = (await second.library.resources(second.library.find(ink.id)!))._unsafeUnwrap();
  // fake-indexeddb clones into Node's realm, so compare the bytes rather than the jsdom `Uint8Array`.
  expect(resources.map(({ id, pixels }) => [id, [...pixels]])).toEqual([['tip', [1, 2, 3, 4]]]);
  expect(readResources).toHaveBeenCalledExactlyOnceWith(['tip']);
  expect(await second.library.load(marker.id)).toBeUndefined();
});

it('deletes a shared image with its last preset, and reads evicted images again', async () => {
  const name = crypto.randomUUID();
  const { library, storage } = open(name, { imageBudget: 4 });
  const first = library.add(preset('First', ['tip']), [image('tip')]);
  const second = library.add(preset('Second', ['tip']));
  const other = library.add(preset('Other', ['other']), [image('other')]);
  await storage.idle();

  const readResources = vi.spyOn(storage, 'readResources');
  // Written images are evictable: reading `other` evicts `tip` from the four-byte budget.
  expect((await library.resources(other))._unsafeUnwrap()).toHaveLength(1);
  expect((await library.resources(second))._unsafeUnwrap()).toHaveLength(1);
  expect(readResources).toHaveBeenCalledExactlyOnceWith(['tip']);

  library.remove(first.id);
  await storage.idle();
  expect(await storage.readResources(['tip'])).toHaveLength(1);
  library.remove(second.id);
  await storage.idle();
  expect(await storage.readResources(['tip'])).toBeUndefined();
  expect(await storage.readResources(['other'])).toHaveLength(1);

  const reopened = open(name);
  const missing = { ...first, id: 'missing' };
  expect((await reopened.library.resources(missing))._unsafeUnwrapErr()).toMatchObject({
    kind: 'brush',
    code: 'storage'
  });
});

it('keeps built-in presets read-only, keeps unsaved images in memory, and reports storage failures once', async () => {
  const onError = vi.fn();
  const { library, storage } = open(crypto.randomUUID(), { onError, imageBudget: 0 });
  library.update('builtin:soft-round', { name: 'Renamed' });
  library.remove('builtin:eraser');
  expect(library.find('builtin:soft-round')?.name).toBe('Soft round');
  expect(library.find('builtin:eraser')).toBeDefined();

  // Functions cannot be cloned into IndexedDB.
  const broken = library.add({ ...preset('Broken', ['tip']), settings: { engine: { id: 'x', settings: () => {} } } }, [
    image('tip')
  ]);
  library.add({ ...preset('Also broken'), settings: { engine: { id: 'x', settings: () => {} } } });
  await storage.idle();
  expect(onError).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ kind: 'brush', code: 'storage' }));
  flush();
  expect(library.presets().map(({ name }) => name)).toContain('Also broken');
  expect((await library.resources(broken))._unsafeUnwrap()).toHaveLength(1);
});

function open(name: string, options: { onError?: () => void; imageBudget?: number } = {}) {
  return createRoot((dispose) => {
    disposers.push(dispose);
    const storage = createBrushStorage({ name, onError: options.onError ?? vi.fn() });
    return { storage, library: createBrushLibrary({ storage, imageBudget: options.imageBudget }) };
  });
}

function preset(name: string, resourceIds: string[] = []): Omit<BrushPreset, 'id'> {
  return { name, settings: { engine: { id: 'textured', settings: { tipId: 'tip' } }, size: 20 }, resourceIds };
}

function image(id: string): BrushResource {
  return { id, width: 2, height: 2, format: 'r8unorm', pixels: new Uint8Array([1, 2, 3, 4]) };
}
