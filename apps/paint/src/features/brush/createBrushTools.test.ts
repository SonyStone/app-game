// @vitest-environment jsdom
import { defaultBrush, type Brush } from '@app-game/paint-core/brush';
import 'fake-indexeddb/auto';
import { createRoot, flush } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import { createBrushLibrary, createBrushStorage, type BrushPreset } from '../brush-library';
import { clearRoundBrush, createBrushTools } from './createBrushTools';

const disposers: (() => void)[] = [];
afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
});

it('keeps separate brush and eraser settings while sharing colors', async () => {
  const { tools, library } = await setup();
  const ink = library.add(abrPreset());
  // Commands in one event, before any flush, must build on each other.
  tools.updateBrush({ size: 30, color: '#ff0000' });
  tools.selectPreset(ink.id, 'brush');
  flush();
  expect(tools.brush()).toMatchObject({ size: 2500, color: '#ff0000', engine: { id: 'abr' } });

  tools.setEraserMode('preset');
  tools.chooseTool('eraser');
  flush();
  expect(tools.brush()).toMatchObject({ tool: 'eraser', color: '#ff0000' });
  expect(tools.brush().engine).toBeUndefined();
  expect(tools.brush().size).not.toBe(2500);
  tools.updateBrush({ size: 80 });
  tools.chooseTool('brush');
  flush();
  expect(tools.brush()).toMatchObject({ tool: 'brush', size: 2500, color: '#ff0000' });
  expect(tools.eraser()).toMatchObject({ tool: 'eraser', size: 80, color: '#ff0000' });

  // The lasso keeps painting settings of the last brush tool.
  tools.chooseTool('lasso');
  flush();
  expect(tools.tool()).toBe('lasso');
  expect(tools.slot()).toBe('brush');
  expect(tools.brush()).toMatchObject({ size: 2500, engine: { id: 'abr' } });
});

it('erases with the brush at the eraser size, or with its own preset when the brush cannot erase', async () => {
  const clear = (brush: Brush) => (brush.engine?.id === 'mixer' ? undefined : clearRoundBrush(brush));
  const { tools, library } = await setup(undefined, clear);
  expect(tools.eraserMode()).toBe('clear');
  tools.updateBrush({ hardness: 0.9 });
  tools.chooseTool('eraser');
  tools.updateBrush({ size: 12 });
  // While erasing with the brush, other settings edit the brush itself.
  tools.updateBrush({ opacity: 0.5 });
  flush();
  expect(tools.brush()).toMatchObject({ tool: 'eraser', size: 12, hardness: 0.9, opacity: 0.5 });
  expect(tools.preset()).toBe('builtin:soft-round');
  tools.chooseTool('brush');
  flush();
  expect(tools.brush()).toMatchObject({ tool: 'brush', size: defaultBrush().size, opacity: 0.5 });
  expect(tools.eraser()).toMatchObject({ tool: 'eraser', size: 12, hardness: 0.9 });

  const mixer = library.add({ name: 'Mixer', settings: { engine: { id: 'mixer', settings: {} } }, resourceIds: [] });
  tools.selectPreset(mixer.id, 'brush');
  flush();
  expect(tools.canClear()).toBe(false);
  expect(tools.eraser()).toMatchObject({ tool: 'eraser', hardness: defaultBrush().hardness });
  expect(tools.eraser().engine).toBeUndefined();

  // Choosing a preset for the eraser switches it to its own preset.
  const hard = library.add(roundPreset('Hard eraser', 20, 'eraser'));
  tools.selectPreset(hard.id, 'eraser');
  flush();
  expect(tools.eraserMode()).toBe('preset');
  expect(tools.preset()).toBe(hard.id);
  expect(tools.brush()).toMatchObject({ tool: 'eraser', size: 20, hardness: 0.8 });

  // A painting preset chosen for the eraser erases with its shape; one that cannot erase becomes a round eraser.
  const pencil = library.add(roundPreset('Pencil', 6));
  tools.selectPreset(pencil.id, 'eraser');
  flush();
  expect(tools.brush()).toMatchObject({ tool: 'eraser', size: 6, hardness: 0.8 });
  tools.selectPreset(mixer.id, 'eraser');
  flush();
  expect(tools.brush().tool).toBe('eraser');
  expect(tools.brush().engine).toBeUndefined();
});

it('swaps and resets colors, and limits sizes per engine', async () => {
  const { tools, library } = await setup();
  tools.updateBrush({ color: '#123456', backgroundColor: '#abcdef' });
  tools.swapColors();
  flush();
  expect(tools.brush()).toMatchObject({ color: '#abcdef', backgroundColor: '#123456' });
  tools.resetColors();
  tools.scaleSize(1000);
  flush();
  expect(tools.brush()).toMatchObject({ color: '#000000', backgroundColor: '#ffffff', size: 512 });

  tools.selectPreset(library.add({ ...abrPreset(), settings: { ...abrPreset().settings, size: 4000 } }).id, 'brush');
  tools.scaleSize(2);
  flush();
  expect(tools.brush().size).toBe(5000);
});

it('remembers changes per preset until they are reset or saved', async () => {
  const { tools, library } = await setup();
  const pencil = library.add(roundPreset('Pencil', 6));
  const marker = library.add(roundPreset('Marker', 60));
  tools.selectPreset(pencil.id, 'brush');
  tools.updateBrush({ size: 4, color: '#00ff00' });
  tools.selectPreset(marker.id, 'brush');
  flush();
  expect(tools.brush().size).toBe(60);
  tools.selectPreset(pencil.id, 'brush');
  flush();
  // Colors are not part of these presets, so they are not changes.
  expect(tools.brush()).toMatchObject({ size: 4, color: '#00ff00' });
  expect(tools.changes(pencil.id)).toEqual({ size: 4 });

  tools.resetPreset(pencil.id);
  flush();
  expect(tools.brush().size).toBe(6);
  expect(tools.changes(pencil.id)).toBeUndefined();

  tools.updateBrush({ size: 5, hardness: 0.2 });
  tools.savePreset();
  flush();
  expect(tools.changes(pencil.id)).toBeUndefined();
  expect(library.find(pencil.id)?.settings).toMatchObject({ size: 5, hardness: 0.2 });

  // Built-in presets are saved as new presets only.
  tools.selectPreset('builtin:soft-round', 'brush');
  tools.updateBrush({ size: 99 });
  tools.savePreset();
  expect(library.find('builtin:soft-round')?.settings.size).toBe(defaultBrush().size);
  const saved = tools.savePresetAs('Big soft', ['size', 'color']);
  flush();
  expect(tools.preset()).toBe(saved.id);
  expect(saved.settings).toMatchObject({ size: 99, color: '#00ff00' });
  expect(saved.settings).not.toHaveProperty('opacity');

  // An eraser erasing with the brush is saved as an erasing preset of its own.
  tools.chooseTool('eraser');
  const eraser = tools.savePresetAs('Soft eraser');
  flush();
  expect(eraser.settings.tool).toBe('eraser');
  expect(tools.eraserMode()).toBe('preset');
  expect(tools.preset()).toBe(eraser.id);

  tools.chooseTool('brush');
  tools.deletePreset(saved.id);
  flush();
  expect(library.find(saved.id)).toBeUndefined();
  expect(tools.preset()).toBe('builtin:soft-round');
});

it('keeps each tool size across presets while sizes are shared', async () => {
  const { tools, library } = await setup();
  const pencil = library.add(roundPreset('Pencil', 6));
  const marker = library.add(roundPreset('Marker', 60));
  tools.setSharedSize(true);
  tools.selectPreset(pencil.id, 'brush');
  tools.updateBrush({ size: 14 });
  tools.selectPreset(marker.id, 'brush');
  flush();
  expect(tools.brush().size).toBe(14);
  expect(tools.changes(pencil.id)).toBeUndefined();

  tools.setSharedSize(false);
  tools.selectPreset(pencil.id, 'brush');
  flush();
  expect(tools.brush().size).toBe(6);
});

it('restores the stored tool state after a reload, unless the user changed it first', async () => {
  const name = crypto.randomUUID();
  const first = await setup(name);
  const ink = first.library.add(abrPreset());
  const unused = first.library.add(roundPreset('Unused', 9));
  first.tools.selectPreset(ink.id, 'brush');
  first.tools.updateBrush({ size: 1234, color: '#ff00ff' });
  first.tools.chooseTool('eraser');
  first.tools.updateBrush({ size: 70 });
  first.tools.setSharedSize(true);
  flush();
  await vi.waitFor(async () => {
    await first.storage.idle();
    const second = await setup(name);
    expect(second.tools.sharedSize()).toBe(true);
  });

  const second = await setup(name);
  // Only the presets in use are loaded.
  expect(second.library.find(unused.id)).toBeUndefined();
  expect(second.tools.tool()).toBe('eraser');
  expect(second.tools.eraser().size).toBe(70);
  second.tools.chooseTool('brush');
  flush();
  expect(second.tools.brush()).toMatchObject({ size: 1234, color: '#ff00ff', engine: { id: 'abr' } });
  expect(second.tools.changes(ink.id)).toEqual({ size: 1234 });
  expect(second.tools.presets().map(({ id }) => id)).toEqual([ink.id, 'builtin:eraser']);

  // A deleted preset's tool falls back to its default preset on reload, losing the engine with its images.
  second.library.remove(ink.id);
  await second.storage.idle();
  const third = await setup(name);
  third.tools.chooseTool('brush');
  flush();
  expect(third.tools.preset()).toBe('builtin:soft-round');
  expect(third.tools.brush().engine).toBeUndefined();

  const early = createRoot((dispose) => {
    disposers.push(dispose);
    const storage = createBrushStorage({ name, onError: vi.fn() });
    const library = createBrushLibrary({ storage });
    return createBrushTools({ library, storage });
  });
  early.updateBrush({ size: 3 });
  await early.loaded;
  flush();
  expect(early.tool()).toBe('brush');
  expect(early.brush().size).toBe(3);
});

async function setup(name?: string, clear?: (brush: Brush) => Brush | undefined) {
  const assembled = createRoot((dispose) => {
    disposers.push(dispose);
    const storage = name === undefined ? undefined : createBrushStorage({ name, onError: vi.fn() });
    const library = createBrushLibrary({ storage });
    return { storage: storage!, library, tools: createBrushTools({ library, storage, clear }) };
  });
  await assembled.tools.loaded;
  return assembled;
}

function roundPreset(name: string, size: number, tool: Brush['tool'] = 'brush'): Omit<BrushPreset, 'id'> {
  return { name, settings: { tool, hardness: 0.8, spacing: 0.1, size }, resourceIds: [] };
}

function abrPreset(): Omit<BrushPreset, 'id'> {
  return {
    name: 'Ink',
    settings: { engine: { id: 'abr', settings: {} }, tool: 'brush', spacing: 0.1, size: 2500 },
    resourceIds: ['tip']
  };
}
