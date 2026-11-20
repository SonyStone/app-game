// @vitest-environment jsdom
import type { BrushResource } from '@app-game/abr-paint/resources';
import { defaultBrush } from '@app-game/paint-core/brush';
import { readArchive } from '@app-game/paint-core/paintbrush/archive';
import 'fake-indexeddb/auto';
import { createRoot, flush } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import { createBrushLibrary, createBrushStorage, createRecentPresets } from '../brush-library';
import { exportPaintbrush } from '../brush-library/paintbrushFile';
import { createBrushTools } from './createBrushTools';
import { createOwnBrushes } from './createOwnBrushes';

const disposers: (() => void)[] = [];
afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
  localStorage.clear();
});

it('renames an own brush in place, keeping its id, place and images, and exports it under the new name', async () => {
  const { library, own } = await setup();
  const first = library.add({ name: 'Soft round 2', settings: defaultBrush(), resourceIds: [image.id] }, [image]);
  const second = library.add({ name: 'Soft round 3', settings: defaultBrush(), resourceIds: [] });

  expect(own.rename(first.id, '  Wet ink  ')).toBe(true);
  const renamed = library.find(first.id)!;
  expect(renamed.name).toBe('Wet ink');
  expect(renamed.resourceIds).toEqual([image.id]);
  expect((await library.resources(renamed))._unsafeUnwrap()).toEqual([image]);
  expect(library.presets().map((preset) => preset.id)).toEqual([
    'builtin:soft-round',
    'builtin:eraser',
    first.id,
    second.id
  ]);
  const archive = await readArchive(await exportPaintbrush(renamed, []));
  if (archive.status !== 'editable') {
    throw new Error(archive.reason);
  }
  expect(archive.brushes[0]!.view.name).toBe('Wet ink');

  // A taken name is allowed, as the library allows it everywhere else.
  expect(own.rename(second.id, 'Wet ink')).toBe(true);
  expect(library.find(second.id)!.name).toBe('Wet ink');
});

it('refuses a blank name and built-in brushes', async () => {
  const { library, own } = await setup();
  const added = library.add({ name: 'Mine', settings: defaultBrush(), resourceIds: [] });

  expect(own.rename(added.id, '   ')).toBe(false);
  expect(library.find(added.id)!.name).toBe('Mine');
  expect(own.rename('builtin:soft-round', 'Other')).toBe(false);
  expect(library.find('builtin:soft-round')!.name).toBe('Soft round');
  expect(own.remove('builtin:soft-round')).toBe(false);
  expect(own.deleting().size).toBe(0);
});

it('deletes the brush in use at once, moving to the next one, and undo brings it back in use', async () => {
  const { library, tools, own, choose } = await setup({ delay: 10_000 });
  const first = library.add({ name: 'One', settings: defaultBrush(), resourceIds: [] });
  const second = library.add({ name: 'Two', settings: defaultBrush(), resourceIds: [] });
  tools.selectPreset(first.id, 'brush');
  flush();

  expect(own.remove(first.id, second.id)).toBe(true);
  flush();
  expect(choose).toHaveBeenLastCalledWith(second.id);
  expect(tools.preset()).not.toBe(first.id);
  expect([...own.deleting().keys()]).toEqual([first.id]);
  // Not final yet: the library keeps the brush for undo.
  expect(library.find(first.id)).toBeDefined();

  tools.selectPreset(second.id, 'brush');
  flush();
  own.undo(first.id);
  flush();
  expect(own.deleting().size).toBe(0);
  expect(choose).toHaveBeenLastCalledWith(first.id);
  expect(library.find(first.id)!.name).toBe('One');
});

it('leaves the brush in use alone on undo when the tool has moved on since', async () => {
  const { library, tools, own, choose } = await setup({ delay: 10_000 });
  const first = library.add({ name: 'One', settings: defaultBrush(), resourceIds: [] });
  const other = library.add({ name: 'Other', settings: defaultBrush(), resourceIds: [] });
  tools.selectPreset(first.id, 'brush');
  own.remove(first.id);
  flush();
  expect(tools.preset()).toBe('builtin:soft-round');

  tools.selectPreset(other.id, 'brush');
  own.undo(first.id);
  flush();
  expect(choose).not.toHaveBeenCalled();
  expect(tools.preset()).toBe(other.id);
});

it('makes a deletion final after its delay, dropping the brush from storage and recents', async () => {
  const name = crypto.randomUUID();
  const { library, tools, own, storage, recent } = await setup({ delay: 20, name });
  const kept = (await library.addStored({ name: 'Kept', settings: defaultBrush(), resourceIds: [] }))._unsafeUnwrap();
  const gone = (await library.addStored({ name: 'Gone', settings: defaultBrush(), resourceIds: [] }))._unsafeUnwrap();
  tools.selectPreset(gone.id, 'brush');
  flush();
  tools.selectPreset(kept.id, 'brush');
  flush();
  expect(recent.recent(7)).toContain(gone.id);

  own.remove(gone.id);
  // Undone in time, the brush was never deleted from storage.
  own.undo(gone.id);
  await storage.idle();
  expect((await storage.readPresets()).map((preset) => preset.name).sort()).toEqual(['Gone', 'Kept']);

  own.remove(gone.id);
  flush();
  await vi.waitFor(() => expect(own.deleting().size).toBe(0));
  await storage.idle();
  expect(library.find(gone.id)).toBeUndefined();
  expect(recent.recent(7)).not.toContain(gone.id);
  expect((await storage.readPresets()).map((preset) => preset.name)).toEqual(['Kept']);
});

it('makes pending deletions final when its owner is disposed', async () => {
  const { library, own, dispose } = await setup({ delay: 10_000 });
  const added = library.add({ name: 'One', settings: defaultBrush(), resourceIds: [] });
  own.remove(added.id);
  dispose();
  expect(library.find(added.id)).toBeUndefined();
});

const image: BrushResource = {
  id: 'tip-image',
  format: 'r8unorm',
  width: 2,
  height: 2,
  pixels: Uint8Array.of(0, 64, 128, 255)
};

async function setup(options: { delay?: number; name?: string } = {}) {
  const choose = vi.fn();
  let dispose = () => {};
  const assembled = createRoot((disposeRoot) => {
    dispose = disposeRoot;
    disposers.push(disposeRoot);
    const storage = createBrushStorage({ name: options.name ?? crypto.randomUUID(), onError: vi.fn() });
    const library = createBrushLibrary({ storage: options.name ? storage : undefined });
    const tools = createBrushTools({ library });
    const recent = createRecentPresets({ current: tools.preset, exists: (id) => library.find(id) !== undefined });
    const own = createOwnBrushes({ library, tools, choose, delay: options.delay });
    return { storage, library, tools, recent, own };
  });
  await assembled.tools.loaded;
  return { ...assembled, choose, dispose: () => dispose() };
}
