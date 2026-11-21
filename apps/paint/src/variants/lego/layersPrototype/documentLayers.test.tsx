// @vitest-environment jsdom
import type { LayerAction } from '@app-game/paint-core/document';
import { render } from '@solidjs/web';
import { createMemo, createRoot, createSignal, flush } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fourLayers, seededDocument } from '../../../component-canvas/seededLayers';
import type { MaskView } from '../../../features/engine/createPaintEngine';
import type { LegoServices } from '../LegoServices';
import { LegoServicesContext } from '../LegoServices';
import { PartFrame } from '../PartFrame';
import { partDefinition } from '../parts';
import type { PartMode } from '../parts/definition';
import { createTestServices } from '../testServices';
import { createDocumentLayers } from './documentLayers';
import { findNode, type LayersModel } from './layersModel';
import { LayersStripPart } from './LayersStripPart';

const disposers: (() => void)[] = [];

beforeEach(() => {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
});

afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
  flush();
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('createDocumentLayers', () => {
  it('lists the engine layers top first with their real properties', () => {
    const { model } = owned(() => seeded());

    expect(model.layers().map((node) => node.name)).toEqual(['Sketch', 'Ink', 'Shadows', 'Flat colors']);
    expect(model.totalCount()).toBe(4);
    expect(model.activeLayer()?.name).toBe('Sketch');

    const [sketch, ink, shadows, flat] = model.layers();
    expect(sketch).toMatchObject({ type: 'raster', visible: false, opacity: 100, blend: 'normal' });
    expect(ink?.locks.alpha).toBe(true);
    expect(shadows?.clipping).toBe(true);
    expect(flat).toMatchObject({
      clipping: false,
      locks: { alpha: false, pixels: false, position: false, all: false }
    });
    expect(model.layers().every((node) => node.children === undefined && node.mask === undefined)).toBe(true);
  });

  it('offers only what the engine keeps', () => {
    const { model } = owned(() => seeded());

    expect(model.capabilities.blendModes.map((mode) => mode.id)).toEqual([
      'pass-through',
      'normal',
      'multiply',
      'screen',
      'overlay'
    ]);
    expect(model.capabilities).toMatchObject({
      locks: ['alpha'],
      clipping: true,
      fill: false,
      blendIf: false,
      colorTags: false,
      reference: false,
      dropZones: ['before', 'after', 'into', 'clip']
    });
    // Folders that blend but are no layers otherwise, masks, and several layers selected for grouping and deleting.
    expect(model.groups).toMatchObject({ blendOnly: true });
    expect(model.selection).toBeDefined();
    expect(model.masks).toBeDefined();
    for (const feature of ['solo', 'paper', 'favoriteBlends', 'clear', 'localUndo'] as const) {
      expect(model[feature], feature).toBeUndefined();
    }
  });

  it('sends one layer action per command and none for changes that change nothing', () => {
    const { model, layers, ids } = owned(() => seeded());
    const action = vi.mocked(layers.action);

    model.select(ids.ink);
    model.update(ids.ink, { visible: false });
    model.update(ids.ink, { opacity: 42.4 });
    model.update(ids.ink, { blend: 'multiply' });
    model.update(ids.ink, { locks: { alpha: false } });
    model.update(ids.ink, { clipping: true });
    model.update(ids.ink, { name: '  Lines  ' });
    expect(action.mock.calls.map(([sent]) => sent)).toEqual([
      { type: 'select', id: ids.ink },
      { type: 'update', id: ids.ink, patch: { visible: false } },
      { type: 'update', id: ids.ink, patch: { opacity: 0.42 } },
      { type: 'update', id: ids.ink, patch: { blend: 'multiply' } },
      { type: 'update', id: ids.ink, patch: { alphaLock: false } },
      { type: 'update', id: ids.ink, patch: { clipping: true } },
      { type: 'update', id: ids.ink, patch: { name: 'Lines' } }
    ]);

    action.mockClear();
    flush();
    model.select(ids.ink);
    model.update(ids.ink, { visible: false, opacity: 42, blend: 'multiply', clipping: true, name: 'Lines' });
    model.update(ids.ink, { name: '   ' });
    model.update(ids.ink, { blend: 'color-dodge', fill: 10, colorTag: 'red', reference: true, locks: { all: true } });
    expect(action).not.toHaveBeenCalled();

    model.addLayer();
    model.duplicate(ids.ink);
    model.delete(ids.flat);
    model.mergeDown(ids.shadows);
    expect(action.mock.calls.map(([sent]) => sent)).toEqual([
      // A new layer goes right above the active one.
      { type: 'add', place: { parentId: null, anchorId: ids.ink, side: 'above' } },
      { type: 'duplicate', id: ids.ink },
      { type: 'delete', id: ids.flat },
      { type: 'merge-down', id: ids.shadows }
    ]);
  });

  it('merges down only onto a shown layer below, and keeps the last layer', () => {
    const { model, layers, ids } = owned(() => seeded());

    expect(model.canMergeDown(ids.sketch)).toBe(false);
    expect(model.canMergeDown(ids.flat)).toBe(false);
    expect(model.canMergeDown(ids.ink)).toBe(true);
    model.mergeDown(ids.sketch);
    expect(layers.action).not.toHaveBeenCalled();

    const single = owned(() => seeded([{ name: 'Only' }]));
    expect(single.model.canDelete(single.ids.only)).toBe(false);
    single.model.delete(single.ids.only);
    expect(single.layers.action).not.toHaveBeenCalled();
  });

  it('turns a drop above or below a tile into one engine relocate to the dropped place', () => {
    const { model, layers, ids } = owned(() => seeded());
    model.reorder(ids.flat, ids.ink, 'after');
    flush();
    expect(layers.action).toHaveBeenCalledExactlyOnceWith({
      type: 'relocate',
      id: ids.flat,
      parentId: null,
      anchorId: ids.ink,
      side: 'below'
    });
    expect(model.layers().map((node) => node.name)).toEqual(['Sketch', 'Ink', 'Flat colors', 'Shadows']);

    // Drops that leave the layer where it is, onto itself or into a layer send nothing.
    vi.mocked(layers.action).mockClear();
    model.reorder(ids.ink, ids.flat, 'before');
    model.reorder(ids.ink, ids.ink, 'after');
    model.reorder(ids.ink, ids.shadows, 'into');
    model.reorder(ids.ink, ids.ink, 'clip');
    model.reorder(ids.ink, 'missing', 'before');
    expect(layers.action).not.toHaveBeenCalled();
  });

  it('turns a clip drop into one relocate that clips, and sends none for a layer clipped there already', () => {
    const { model, layers, ids } = owned(() => seeded());
    model.reorder(ids.sketch, ids.flat, 'clip');
    flush();
    expect(layers.action).toHaveBeenCalledExactlyOnceWith({
      type: 'relocate',
      id: ids.sketch,
      parentId: null,
      anchorId: ids.flat,
      side: 'above',
      clipping: true
    });
    expect(model.layers().map((node) => [node.name, node.clipping])).toEqual([
      ['Ink', false],
      ['Shadows', true],
      ['Sketch', true],
      ['Flat colors', false]
    ]);

    // Clipping a layer in place is the same step; one clipped there already, or a folder, sends nothing.
    vi.mocked(layers.action).mockClear();
    model.reorder(ids.ink, ids.shadows, 'clip');
    model.reorder(ids.sketch, ids.flat, 'clip');
    model.groups!.group([ids.flat]);
    flush();
    const folder = model.layers().at(-1)!.id;
    model.reorder(folder, ids.ink, 'clip');
    expect(vi.mocked(layers.action).mock.calls.map(([action]) => action)).toEqual([
      { type: 'relocate', id: ids.ink, parentId: null, anchorId: ids.shadows, side: 'above', clipping: true },
      { type: 'group', ids: [ids.flat] }
    ]);
  });

  it('reads thumbnails only while asked to', () => {
    const [shown, setShown] = createSignal(false);
    const { model, layers } = owned(() => seeded(fourLayers, shown));

    expect(model.layers().every((node) => node.thumb === undefined)).toBe(true);
    expect(layers.thumbnail).not.toHaveBeenCalled();
    setShown(true);
    flush();
    expect(model.layers()[0]?.thumb).toBe(`blob:${model.layers()[0]!.id}`);
  });
});

describe('layers:strip over the drawing', () => {
  it('shows real layers and badges, the group and selection controls, and none of the mask, Solo or Paper ones', () => {
    vi.useFakeTimers();
    const { model, ids, layers } = owned(() => seeded(fourLayers, () => true));
    mountStrip(model);

    const tiles = [...document.querySelectorAll<HTMLElement>('[data-layer-tile]')];
    expect(tiles.map((tile) => tile.getAttribute('aria-label'))).toEqual(['Sketch', 'Ink', 'Shadows', 'Flat colors']);
    expect(tile(ids.sketch).hasAttribute('data-hidden')).toBe(true);
    expect(tile(ids.shadows).hasAttribute('data-clipping')).toBe(true);
    expect(tile(ids.ink).querySelector('[aria-label="Locked"]')).not.toBeNull();
    expect(tile(ids.ink).querySelector('img')?.getAttribute('src')).toBe(`blob:${ids.ink}`);

    expect(document.querySelector('[aria-label="New layer"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="New group"]')).not.toBeNull();
    expect(document.querySelector('[aria-label^="Toggle mask target"]')).toBeNull();
    // No folder yet, so none to open.
    expect(document.querySelector('[aria-label^="Open group"]')).toBeNull();
    expect(document.querySelector('[aria-label="Paper settings"]')).toBeNull();

    // A right swipe selects the layer for grouping or deleting; a long press on the eye only toggles visibility once
    // released.
    pointer(tile(ids.ink), 'pointerdown', { x: 10, y: 20 });
    pointer(window, 'pointermove', { x: 70, y: 20 });
    pointer(window, 'pointerup', { x: 70, y: 20 });
    expect(document.querySelector('[aria-label="Selected layers"]')?.textContent).toContain('1 sel');
    expect(layers.action).not.toHaveBeenCalled();
    document.querySelector<HTMLButtonElement>('[aria-label="Clear selection"]')!.click();
    flush();

    const eye = document.querySelector<HTMLButtonElement>('[aria-label="Toggle visibility for Ink"]')!;
    pointer(eye, 'pointerdown', { x: 5, y: 5 });
    vi.advanceTimersByTime(600);
    flush();
    expect(eye.hasAttribute('data-solo')).toBe(false);
    pointer(eye, 'pointerup', { x: 5, y: 5 });
    eye.click();
    flush();
    expect(layers.action).toHaveBeenLastCalledWith({ type: 'update', id: ids.ink, patch: { visible: false } });
  });

  it('opens a properties popover with only the real properties, one undo step per slider drag', () => {
    const { model, ids, layers } = owned(() => seeded());
    mountStrip(model);

    pointer(tile(ids.ink), 'pointerdown', { x: 20, y: 20 });
    pointer(window, 'pointerup', { x: 20, y: 20 });
    expect(layers.action).toHaveBeenLastCalledWith({ type: 'select', id: ids.ink });
    pointer(tile(ids.ink), 'pointerdown', { x: 20, y: 20 });
    pointer(window, 'pointerup', { x: 20, y: 20 });

    const popover = document.querySelector<HTMLElement>('[role="dialog"][aria-label="Layer properties: Ink"]')!;
    expect(popover).not.toBeNull();
    const labels = [...popover.querySelectorAll('button')].map((button) => button.textContent?.trim());
    expect(labels).toEqual(expect.arrayContaining(['αLock', '↳Clip', '◐Mask', 'Dup', 'Group', 'Merge', 'Delete']));
    for (const absent of ['Ungroup', 'Clear']) {
      expect(labels).not.toContain(absent);
    }
    expect(popover.querySelector('[aria-label="More layer settings"]')).toBeNull();

    vi.mocked(layers.action).mockClear();
    const slider = popover.querySelector<HTMLElement>('[role="slider"][aria-label="Opacity"]')!;
    slider.getBoundingClientRect = () => new DOMRect(0, 0, 200, 34);
    pointer(slider, 'pointerdown', { x: 160, y: 17 });
    pointer(window, 'pointermove', { x: 120, y: 17 });
    pointer(window, 'pointermove', { x: 100, y: 17 });
    expect(slider.getAttribute('aria-valuenow')).toBe('50');
    expect(layers.action).not.toHaveBeenCalled();
    pointer(window, 'pointerup', { x: 100, y: 17 });
    expect(layers.action).toHaveBeenCalledExactlyOnceWith({ type: 'update', id: ids.ink, patch: { opacity: 0.5 } });

    popover.querySelector<HTMLButtonElement>('[aria-label="Open blend modes"]')!.click();
    flush();
    const options = [...popover.querySelectorAll<HTMLButtonElement>('[role="option"]')];
    expect(options.map((option) => option.textContent)).toEqual(['NormalN', 'MultiplyM', 'ScreenSc', 'OverlayOv']);
    expect(popover.querySelector('[role="slider"][aria-label="Fill"]')).toBeNull();
    expect(popover.querySelector('[aria-label^="Favorite"]')).toBeNull();
    options[2]!.click();
    flush();
    expect(layers.action).toHaveBeenLastCalledWith({ type: 'update', id: ids.ink, patch: { blend: 'screen' } });
  });

  it('commits a rename once, on Enter', () => {
    const { model, ids, layers } = owned(() => seeded());
    model.select(ids.ink);
    flush();
    mountStrip(model);
    document.querySelector<HTMLButtonElement>('[aria-label="Layer properties for Ink"]')!.click();
    flush();
    document.querySelector<HTMLButtonElement>('[aria-label="Rename layer"]')!.click();
    flush();
    vi.mocked(layers.action).mockClear();

    const input = document.querySelector<HTMLInputElement>('[aria-label="Layer name"]')!;
    input.value = 'Lines';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(layers.action).not.toHaveBeenCalled();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    flush();
    expect(layers.action).toHaveBeenCalledExactlyOnceWith({ type: 'update', id: ids.ink, patch: { name: 'Lines' } });
  });

  it('moves by drag to the dropped place in one engine step', () => {
    const { model, ids, layers } = owned(() => seeded());
    mountStrip(model);
    const flat = tile(ids.flat);
    const sketch = tile(ids.sketch);
    sketch.getBoundingClientRect = () => new DOMRect(0, 0, 60, 60);
    document.elementFromPoint = vi.fn(() => sketch);

    pointer(flat, 'pointerdown', { x: 30, y: 200 });
    pointer(window, 'pointermove', { x: 30, y: 100 });
    pointer(window, 'pointermove', { x: 30, y: 5 });
    expect(sketch.getAttribute('data-drop')).toBe('before');
    pointer(window, 'pointerup', { x: 30, y: 5 });

    expect(layers.action).toHaveBeenCalledExactlyOnceWith({
      type: 'relocate',
      id: ids.flat,
      parentId: null,
      anchorId: ids.sketch,
      side: 'above'
    });
    expect(model.layers().map((node) => node.name)).toEqual(['Flat colors', 'Sketch', 'Ink', 'Shadows']);

    // The right of a layer's middle is a clip drop: above it and clipped to it, in one engine step.
    vi.mocked(layers.action).mockClear();
    const ink = tile(ids.ink);
    ink.getBoundingClientRect = () => new DOMRect(0, 0, 60, 60);
    document.elementFromPoint = vi.fn(() => ink);
    pointer(tile(ids.shadows), 'pointerdown', { x: 30, y: 200 });
    pointer(window, 'pointermove', { x: 55, y: 100 });
    pointer(window, 'pointermove', { x: 55, y: 25 });
    expect(ink.getAttribute('data-drop')).toBe('clip');
    pointer(window, 'pointerup', { x: 55, y: 25 });
    expect(layers.action).toHaveBeenCalledExactlyOnceWith({
      type: 'relocate',
      id: ids.shadows,
      parentId: null,
      anchorId: ids.ink,
      side: 'above',
      clipping: true
    });
  });

  it('disables structural commands until the engine is ready', () => {
    const [ready, setReady] = createSignal(false);
    const { model, ids, layers } = owned(() => seeded(fourLayers, () => false, ready));
    mountStrip(model);

    expect(document.querySelector<HTMLButtonElement>('[aria-label="New layer"]')!.disabled).toBe(true);
    const flat = tile(ids.flat);
    const sketch = tile(ids.sketch);
    sketch.getBoundingClientRect = () => new DOMRect(0, 0, 60, 60);
    document.elementFromPoint = vi.fn(() => sketch);
    pointer(flat, 'pointerdown', { x: 30, y: 200 });
    pointer(window, 'pointermove', { x: 30, y: 5 });
    expect(flat.hasAttribute('data-dragging')).toBe(false);
    pointer(window, 'pointerup', { x: 30, y: 5 });

    document.querySelector<HTMLButtonElement>('[aria-label="Layer properties for Sketch"]')!.click();
    flush();
    const actions = document.querySelector('[aria-label="Layer actions"]')!;
    expect(
      [...actions.querySelectorAll<HTMLButtonElement>('button')].map((button) => [
        button.textContent?.trim(),
        button.disabled
      ])
    ).toEqual([
      ['Dup', true],
      ['Group', true],
      ['Merge', true],
      ['Delete', true]
    ]);
    expect(layers.action).not.toHaveBeenCalled();

    setReady(true);
    flush();
    expect(document.querySelector<HTMLButtonElement>('[aria-label="New layer"]')!.disabled).toBe(false);
  });

  it('groups the pinched layers in one engine step, with a toast but no undo of its own', () => {
    const { model, ids, layers } = owned(() => seeded());
    mountStrip(model);

    pointer(tile(ids.sketch), 'pointerdown', { x: 30, y: 20, pointerId: 10, pointerType: 'touch' });
    pointer(tile(ids.ink), 'pointerdown', { x: 30, y: 120, pointerId: 11, pointerType: 'touch' });
    pointer(window, 'pointermove', { x: 30, y: 55, pointerId: 10, pointerType: 'touch' });
    pointer(window, 'pointermove', { x: 30, y: 75, pointerId: 11, pointerType: 'touch' });
    pointer(window, 'pointerup', { x: 30, y: 55, pointerId: 10, pointerType: 'touch' });
    pointer(window, 'pointerup', { x: 30, y: 75, pointerId: 11, pointerType: 'touch' });

    // One structural action; a lifted finger may select a tile, which is no undo step.
    const sent = vi.mocked(layers.action).mock.calls.map(([action]) => action);
    expect(sent.filter((action) => action.type !== 'select')).toEqual([{ type: 'group', ids: [ids.sketch, ids.ink] }]);
    expect(model.layers().map((node) => [node.name, node.children?.map((child) => child.name)])).toEqual([
      ['Group 1', ['Sketch', 'Ink']],
      ['Shadows', undefined],
      ['Flat colors', undefined]
    ]);
    // The board's Undo takes the grouping back.
    expect(document.querySelector('[role="status"]')?.textContent).toBe('Grouped 2 layers');
  });
});

describe('folders on the drawing', () => {
  /** The seeded drawing with Ink and Shadows grouped into `Group 1`; groups them outside the model's owner. */
  function withFolder() {
    const seededModel = owned(() => seeded());
    seededModel.model.groups!.group([seededModel.ids.ink, seededModel.ids.shadows]);
    flush();
    vi.mocked(seededModel.layers.action).mockClear();
    const folder = seededModel.model.layers()[1]!.id;
    return { ...seededModel, folder };
  }

  it('maps the tree top first, a new folder Pass Through at full strength without a thumbnail', () => {
    const { model, ids, folder } = withFolder();

    expect(model.layers().map((node) => [node.name, node.children?.map((child) => child.name)])).toEqual([
      ['Sketch', undefined],
      ['Group 1', ['Ink', 'Shadows']],
      ['Flat colors', undefined]
    ]);
    expect(model.layers()[1]).toMatchObject({
      id: folder,
      type: 'group',
      blend: 'pass-through',
      opacity: 100,
      clipping: false,
      thumb: undefined
    });
    expect(model.totalCount()).toBe(5);
    expect(model.activeLayer()?.id).toBe(folder);
    expect(model.layers()[1]!.children![0]!.id).toBe(ids.ink);
    model.update(folder, { blend: 'screen', opacity: 35 });
    flush();
    expect(model.layers()[1]).toMatchObject({ blend: 'screen', opacity: 35 });
  });

  it('sends one engine action per folder command, and keeps a folder’s blending but no clipping or locks', () => {
    const { model, layers, ids, folder } = withFolder();
    const sent = () => vi.mocked(layers.action).mock.calls.map(([action]) => action);
    const groups = model.groups!;
    const innerFolder = () => model.layers()[1]!.children!.find((child) => child.name === 'Group 2')?.id;

    model.update(folder, { clipping: true, locks: { alpha: true }, blend: 'pass-through', opacity: 100 });
    model.update(folder, { blend: 'color-dodge' });
    expect(layers.action).not.toHaveBeenCalled();
    // Commands come from separate events, each after the state of the one before.
    for (const command of [
      () => model.update(folder, { opacity: 40, blend: 'multiply', clipping: true, locks: { alpha: true } }),
      () => model.update(folder, { blend: 'pass-through' }),
      () => model.update(ids.ink, { blend: 'pass-through' }),
      () => model.update(folder, { name: ' Lines ', visible: false }),
      () => model.update(folder, { visible: true }),
      () => model.select(ids.ink),
      () => groups.add(),
      () => model.addLayer()
    ]) {
      command();
      flush();
    }
    expect(sent()).toEqual([
      { type: 'update', id: folder, patch: { opacity: 0.4, blend: 'multiply' } },
      { type: 'update', id: folder, patch: { blend: 'pass-through' } },
      // A layer cannot be Pass Through, so nothing went for Ink.
      { type: 'update', id: folder, patch: { name: 'Lines', visible: false } },
      { type: 'update', id: folder, patch: { visible: true } },
      { type: 'select', id: ids.ink },
      // New nodes go right above the active layer, inside its folder.
      { type: 'add-group', place: { parentId: folder, anchorId: ids.ink, side: 'above' } },
      // The new folder is active then.
      { type: 'add', place: { parentId: folder, anchorId: innerFolder(), side: 'above' } }
    ]);
    expect(model.layers()[1]!.children!.map((child) => child.name)).toEqual(['Layer 5', 'Group 2', 'Ink', 'Shadows']);

    vi.mocked(layers.action).mockClear();
    for (const command of [
      () => groups.moveOut(ids.shadows),
      () => model.reorder(ids.flat, folder, 'into'),
      () => model.reorder(ids.sketch, ids.ink, 'after'),
      // A folder cannot go into itself or a folder inside it; the engine would refuse, so nothing is sent.
      () => model.reorder(folder, ids.ink, 'before'),
      () => model.reorder(folder, folder, 'into'),
      () => groups.ungroup!(folder)
    ]) {
      command();
      flush();
    }
    expect(sent()).toEqual([
      { type: 'relocate', id: ids.shadows, parentId: null, anchorId: folder, side: 'above' },
      { type: 'relocate', id: ids.flat, parentId: folder, side: 'above' },
      { type: 'relocate', id: ids.sketch, parentId: folder, anchorId: ids.ink, side: 'below' },
      { type: 'ungroup', id: folder }
    ]);
  });

  it('deletes and groups a multi-selection as one action each, and merges only within a folder', () => {
    const { model, layers, ids, folder } = withFolder();
    const selection = model.selection!;

    for (const id of [ids.sketch, ids.flat, ids.sketch, ids.ink]) {
      selection.toggle(id);
      flush();
    }
    expect(selection.ids()).toEqual([ids.flat, ids.ink]);
    selection.delete(selection.ids());
    flush();
    expect(layers.action).toHaveBeenLastCalledWith({ type: 'delete', ids: [ids.flat, ids.ink] });
    expect(selection.ids()).toEqual([]);
    expect(model.layers().map((node) => node.name)).toEqual(['Sketch', 'Group 1']);

    selection.toggle(ids.sketch);
    flush();
    model.groups!.group(selection.ids());
    flush();
    expect(layers.action).toHaveBeenLastCalledWith({ type: 'group', ids: [ids.sketch] });
    expect(selection.ids()).toEqual([]);
    vi.mocked(layers.action).mockClear();

    // Shadows is the only layer left outside Sketch's new folder: deleting it with its folder would leave Sketch.
    expect(model.canDelete(folder)).toBe(true);
    const fresh = withFolder();
    expect(fresh.model.canMergeDown(fresh.ids.ink)).toBe(true);
    expect(fresh.model.canMergeDown(fresh.ids.shadows)).toBe(false);
    // A folder below is no layer to merge into.
    expect(fresh.model.canMergeDown(fresh.ids.sketch)).toBe(false);
    expect(fresh.model.canMergeDown(fresh.folder)).toBe(false);
    fresh.model.update(fresh.folder, { visible: false });
    flush();
    expect(fresh.model.canMergeDown(fresh.ids.ink)).toBe(false);
  });

  it('opens a folder in the narrow strip with a Back row, and drops a layer into a folder in one relocate', () => {
    const { model, layers, ids, folder } = withFolder();
    mountStrip(model);

    expect(tiles()).toEqual(['Sketch', 'Group 1', 'Flat colors']);
    document.querySelector<HTMLButtonElement>('[aria-label="Open group Group 1"]')!.click();
    flush();
    expect(tiles()).toEqual(['Ink', 'Shadows']);
    expect(layers.action).toHaveBeenLastCalledWith({ type: 'select', id: ids.ink });
    document.querySelector<HTMLButtonElement>('[aria-label="Back from Group 1"]')!.click();
    flush();
    expect(tiles()).toEqual(['Sketch', 'Group 1', 'Flat colors']);
    expect(layers.action).toHaveBeenLastCalledWith({ type: 'select', id: folder });

    vi.mocked(layers.action).mockClear();
    const target = tile(folder);
    target.getBoundingClientRect = () => new DOMRect(0, 0, 60, 60);
    document.elementFromPoint = vi.fn(() => target);
    pointer(tile(ids.flat), 'pointerdown', { x: 30, y: 200 });
    pointer(window, 'pointermove', { x: 30, y: 100 });
    pointer(window, 'pointermove', { x: 20, y: 30 });
    expect(target.getAttribute('data-drop')).toBe('into');
    pointer(window, 'pointerup', { x: 20, y: 30 });
    expect(layers.action).toHaveBeenCalledExactlyOnceWith({
      type: 'relocate',
      id: ids.flat,
      parentId: folder,
      side: 'above'
    });
    expect(model.layers()[1]!.children!.map((child) => child.name)).toEqual(['Flat colors', 'Ink', 'Shadows']);
  });

  it('shows the folders as an indented tree in the wide look, open until collapsed', () => {
    const { model, folder } = withFolder();
    mountView(() => <LayersStripPart model={model} wide interactive acquireThumbnails />);

    const rows = () =>
      [...document.querySelectorAll<HTMLElement>('[data-layer-tile]')].map((row) => [
        row.getAttribute('aria-label'),
        row.dataset.depth
      ]);
    expect(rows()).toEqual([
      ['Sketch', '0'],
      ['Group 1', '0'],
      ['Ink', '1'],
      ['Shadows', '1'],
      ['Flat colors', '0']
    ]);
    document.querySelector<HTMLButtonElement>('[aria-label="Collapse Group 1"]')!.click();
    flush();
    expect(rows().map(([name]) => name)).toEqual(['Sketch', 'Group 1', 'Flat colors']);
    expect(model.groups!.expandedIds()).not.toContain(folder);
  });

  it('offers a folder its name, blending, visibility, a mask, Dup, Group, Ungroup and Delete', () => {
    const { model, layers, folder } = withFolder();
    mountStrip(model);
    document.querySelector<HTMLButtonElement>('[aria-label="Layer properties for Group 1"]')!.click();
    flush();

    const popover = document.querySelector<HTMLElement>('[role="dialog"][aria-label="Layer properties: Group 1"]')!;
    const labels = [...popover.querySelectorAll('button')].map((button) => button.textContent?.trim());
    expect(labels).toEqual([
      'Group 1',
      'Blend modePass Through ›',
      'Shown',
      '◐Mask',
      'Dup',
      'Group',
      'Ungroup',
      'Delete'
    ]);
    expect(popover.querySelectorAll('[role="slider"]')).toHaveLength(1);
    expect(document.querySelector('[aria-label^="Toggle mask target"]')).toBeNull();

    [...popover.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === 'Shown')!
      .click();
    expect(layers.action).toHaveBeenLastCalledWith({ type: 'update', id: folder, patch: { visible: false } });
    [...popover.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === 'Ungroup')!
      .click();
    flush();
    expect(layers.action).toHaveBeenLastCalledWith({ type: 'ungroup', id: folder });
    expect(tiles()).toEqual(['Sketch', 'Ink', 'Shadows', 'Flat colors']);
  });
});

describe('masks on the drawing', () => {
  /** The drawing with a mask on `Ink`, the paint target, its red overlay on. */
  function masked() {
    const seededModel = owned(() => seeded(fourLayers, () => true));
    seededModel.model.masks!.add(seededModel.ids.ink);
    flush();
    return seededModel;
  }

  it('adds a mask in one action, paints it at once with its red overlay, and shows it on the tile', () => {
    const { model, layers, ids } = masked();
    expect(layers.action).toHaveBeenLastCalledWith({ type: 'add-mask', id: ids.ink });
    const ink = findNode(model.layers(), ids.ink)!;
    const maskId = layers.state().nodes.find((node) => node.id === ids.ink)!.mask!.id;
    expect(ink.mask).toEqual({ thumb: `blob:${maskId}`, enabled: true, linked: true, inverted: false });
    expect(model.activeId()).toBe(ids.ink);
    expect(model.masks!.target()).toBe('mask');
    expect(model.masks!.overlay()).toBe(true);
    // A node that has a mask gets no second one.
    vi.mocked(layers.action).mockClear();
    model.masks!.add(ids.ink);
    flush();
    expect(layers.action).not.toHaveBeenCalled();
  });

  it('switches the paint target between pixels and mask, and leaves the mask', () => {
    const { model, layers, ids } = masked();
    const action = vi.mocked(layers.action);
    model.masks!.setTarget(ids.ink, 'layer');
    flush();
    expect(action).toHaveBeenLastCalledWith({ type: 'select', id: ids.ink, target: 'pixels' });
    expect(model.masks!.target()).toBe('layer');
    model.masks!.setTarget(ids.ink, 'mask');
    flush();
    expect(action).toHaveBeenLastCalledWith({ type: 'select', id: ids.ink, target: 'mask' });
    // Already there, or a node without a mask: nothing.
    action.mockClear();
    model.masks!.setTarget(ids.ink, 'mask');
    flush();
    model.masks!.setTarget(ids.flat, 'mask');
    flush();
    expect(action).not.toHaveBeenCalled();
    model.masks!.exit();
    flush();
    expect(action).toHaveBeenLastCalledWith({ type: 'select', id: ids.ink, target: 'pixels' });
    // Selecting another layer paints its pixels.
    model.masks!.setTarget(ids.ink, 'mask');
    flush();
    model.select(ids.ink);
    flush();
    expect(action).toHaveBeenLastCalledWith({ type: 'select', id: ids.ink });
    expect(model.masks!.target()).toBe('layer');
  });

  it('enables, links, inverts, applies and deletes the mask, one action and one undo step each', () => {
    const { model, layers, ids } = masked();
    const action = vi.mocked(layers.action);
    const steps = () => layers.state().historyStates.length;
    const before = steps();
    model.masks!.toggleEnabled(ids.ink);
    flush();
    expect(action).toHaveBeenLastCalledWith({ type: 'update-mask', id: ids.ink, patch: { enabled: false } });
    model.masks!.toggleLinked!(ids.ink);
    flush();
    expect(action).toHaveBeenLastCalledWith({ type: 'update-mask', id: ids.ink, patch: { linked: false } });
    model.masks!.invert(ids.ink);
    flush();
    expect(action).toHaveBeenLastCalledWith({ type: 'update-mask', id: ids.ink, patch: { inverted: true } });
    expect(findNode(model.layers(), ids.ink)!.mask).toMatchObject({ enabled: false, linked: false, inverted: true });
    expect(steps()).toBe(before + 3);
    expect(model.masks!.canApply!(ids.ink)).toBe(true);
    model.masks!.apply!(ids.ink);
    flush();
    expect(action).toHaveBeenLastCalledWith({ type: 'apply-mask', id: ids.ink });
    model.masks!.remove(ids.ink);
    flush();
    expect(action).toHaveBeenLastCalledWith({ type: 'delete-mask', id: ids.ink });
    expect(findNode(model.layers(), ids.ink)!.mask).toBeUndefined();
    expect(model.masks!.target()).toBe('layer');
  });

  it('gives a folder a mask, which it cannot apply', () => {
    const { model, layers } = owned(() => seeded(fourLayers, () => true));
    model.groups!.add();
    flush();
    const folder = layers.state().nodes.find((node) => node.kind === 'group')!.id;
    model.masks!.add(folder);
    flush();
    flush();
    expect(layers.action).toHaveBeenLastCalledWith({ type: 'add-mask', id: folder });
    expect(findNode(model.layers(), folder)!.mask).toMatchObject({ enabled: true });
    expect(model.masks!.canApply!(folder)).toBe(false);
    vi.mocked(layers.action).mockClear();
    model.masks!.apply!(folder);
    flush();
    expect(layers.action).not.toHaveBeenCalled();
  });

  it('sends Reveal and Hide and the red overlay as view settings, outside the history', () => {
    const { model, layers } = masked();
    const view = vi.mocked(layers.maskCommand);
    const steps = layers.state().historyStates.length;
    model.masks!.setBrush('hide');
    flush();
    expect(view).toHaveBeenLastCalledWith({ type: 'mask-paint', paint: 'hide' });
    expect(model.masks!.brush()).toBe('hide');
    view.mockClear();
    model.masks!.setBrush('hide');
    flush();
    expect(view).not.toHaveBeenCalled();
    model.masks!.toggleOverlay();
    flush();
    expect(view).toHaveBeenLastCalledWith({ type: 'mask-overlay', enabled: false });
    expect(model.masks!.overlay()).toBe(false);
    expect(layers.state().historyStates).toHaveLength(steps);
  });

  it('shows the mask corner and the painting-on-mask header on the strip, and its controls work', () => {
    const { model, layers, ids } = masked();
    mountStrip(model);
    const corner = document.querySelector<HTMLButtonElement>('[aria-label="Toggle mask target for Ink"]')!;
    expect(corner).not.toBeNull();
    expect(corner.hasAttribute('data-active')).toBe(true);
    const header = document.querySelector<HTMLElement>('[role="toolbar"][aria-label="Mask controls"]')!;
    expect(header).not.toBeNull();
    // While painting the mask, the header offers Reveal and Hide, the red overlay and leaving the mask.
    header.querySelector<HTMLButtonElement>('[aria-label="Red mask overlay"]')!.click();
    flush();
    expect(layers.maskCommand).toHaveBeenLastCalledWith({ type: 'mask-overlay', enabled: false });
    header.querySelector<HTMLButtonElement>('[aria-label="Exit mask mode"]')!.click();
    flush();
    expect(layers.action).toHaveBeenLastCalledWith({ type: 'select', id: ids.ink, target: 'pixels' });
    expect(document.querySelector('[role="toolbar"][aria-label="Mask controls"]')).toBeNull();
    // The corner takes the mask back as the target.
    document.querySelector<HTMLButtonElement>('[aria-label="Toggle mask target for Ink"]')!.click();
    flush();
    expect(layers.action).toHaveBeenLastCalledWith({ type: 'select', id: ids.ink, target: 'mask' });
  });

  it('shows the mask thumbnail beside the layer’s in the wide look', () => {
    const { model, layers, ids } = masked();
    mountView(() => <LayersStripPart model={model} wide interactive acquireThumbnails />);
    const maskId = layers.state().nodes.find((node) => node.id === ids.ink)!.mask!.id;
    const button = document.querySelector<HTMLButtonElement>('[aria-label="Select mask for Ink"]')!;
    expect(button.querySelector('img')?.getAttribute('src')).toBe(`blob:${maskId}`);
  });

  it('offers the mask page: target, enabled, overlay, linked, apply, invert and delete', () => {
    const { model, layers, ids } = masked();
    mountStrip(model);
    document.querySelector<HTMLButtonElement>('[aria-label="Layer properties for Ink"]')!.click();
    flush();
    const popover = () => document.querySelector<HTMLElement>('[role="dialog"][aria-label="Layer properties: Ink"]')!;
    popover().querySelector<HTMLButtonElement>('[aria-label="Open mask settings"]')!.click();
    flush();
    const labels = [...popover().querySelectorAll('button')].map((button) => button.textContent?.trim());
    expect(labels).toEqual(
      expect.arrayContaining([
        'Layer',
        'Mask',
        'Enabled',
        'Red overlay',
        'Linked',
        'Apply mask',
        'Invert mask',
        'Delete mask'
      ])
    );
    const press = (label: string) =>
      [...popover().querySelectorAll<HTMLButtonElement>('button')]
        .find((button) => button.textContent?.trim() === label)!
        .click();
    press('Linked');
    expect(layers.action).toHaveBeenLastCalledWith({ type: 'update-mask', id: ids.ink, patch: { linked: false } });
    press('Apply mask');
    expect(layers.action).toHaveBeenLastCalledWith({ type: 'apply-mask', id: ids.ink });
  });
});

describe('blending folders on the drawing', () => {
  it('lists Pass Through first for a folder, sends its blend mode and opacity, and badges its tile', () => {
    const { model, layers, folder } = withFolderOutside();
    mountStrip(model);
    document.querySelector<HTMLButtonElement>('[aria-label="Layer properties for Group 1"]')!.click();
    flush();
    const popover = document.querySelector<HTMLElement>('[role="dialog"][aria-label="Layer properties: Group 1"]')!;

    vi.mocked(layers.action).mockClear();
    const slider = popover.querySelector<HTMLElement>('[role="slider"][aria-label="Opacity"]')!;
    slider.getBoundingClientRect = () => new DOMRect(0, 0, 200, 34);
    pointer(slider, 'pointerdown', { x: 160, y: 17 });
    pointer(window, 'pointermove', { x: 120, y: 17 });
    pointer(window, 'pointerup', { x: 120, y: 17 });
    expect(layers.action).toHaveBeenCalledExactlyOnceWith({ type: 'update', id: folder, patch: { opacity: 0.6 } });

    popover.querySelector<HTMLButtonElement>('[aria-label="Open blend modes"]')!.click();
    flush();
    const options = [...popover.querySelectorAll<HTMLButtonElement>('[role="option"]')];
    expect(options.map((option) => option.textContent)).toEqual([
      'Pass ThroughPT',
      'NormalN',
      'MultiplyM',
      'ScreenSc',
      'OverlayOv'
    ]);
    expect(options[0]!.getAttribute('aria-selected')).toBe('true');
    options[2]!.click();
    flush();
    expect(layers.action).toHaveBeenLastCalledWith({ type: 'update', id: folder, patch: { blend: 'multiply' } });
    expect(tile(folder).querySelector('[class*="modeBadge"]')?.textContent).toBe('M 60%');
  });

  it('clips a layer onto a folder by a drop on the folder’s right, and offers no clip drop for a dragged folder', () => {
    const { model, layers, ids, folder } = withFolderOutside();
    mountStrip(model);
    const target = tile(folder);
    target.getBoundingClientRect = () => new DOMRect(0, 0, 60, 60);
    document.elementFromPoint = vi.fn(() => target);

    vi.mocked(layers.action).mockClear();
    pointer(tile(ids.sketch), 'pointerdown', { x: 30, y: -100 });
    pointer(window, 'pointermove', { x: 55, y: -50 });
    pointer(window, 'pointermove', { x: 55, y: 30 });
    expect(target.getAttribute('data-drop')).toBe('clip');
    pointer(window, 'pointerup', { x: 55, y: 30 });
    expect(layers.action).toHaveBeenCalledExactlyOnceWith({
      type: 'relocate',
      id: ids.sketch,
      parentId: null,
      anchorId: folder,
      side: 'above',
      clipping: true
    });
    // The clip toggle of a layer right above a folder clips it to the folder.
    expect(model.layers()[0]).toMatchObject({ name: 'Sketch', clipping: true });

    const flat = tile(ids.flat);
    flat.getBoundingClientRect = () => new DOMRect(0, 0, 60, 60);
    document.elementFromPoint = vi.fn(() => flat);
    pointer(tile(folder), 'pointerdown', { x: 30, y: -100 });
    pointer(window, 'pointermove', { x: 55, y: -50 });
    pointer(window, 'pointermove', { x: 55, y: 30 });
    expect(flat.getAttribute('data-drop')).not.toBe('clip');
    pointer(window, 'pointerup', { x: 55, y: 30 });
  });
});

/** The seeded drawing with Ink and Shadows grouped into `Group 1`. */
function withFolderOutside() {
  const seededModel = owned(() => seeded());
  seededModel.model.groups!.group([seededModel.ids.ink, seededModel.ids.shadows]);
  flush();
  const folder = seededModel.model.layers()[1]!.id;
  return { ...seededModel, folder };
}

describe('layers parts', () => {
  it.each(['layers:strip', 'layers:opener'])(
    '%s acquires thumbnails only outside previews and edits through the guarded command',
    (kind) => {
      const { services } = owned(createTestServices);
      const release = vi.fn();
      services.layers.wantThumbnails = vi.fn(() => release);
      const [mode, setMode] = createSignal<PartMode>('preview');
      mountView(() => (
        <LegoServicesContext value={services}>
          <PartFrame kind={kind} span={{ columns: 2, rows: 8 }} mode={mode()} immediate />
        </LegoServicesContext>
      ));

      expect(services.layers.wantThumbnails).not.toHaveBeenCalled();
      expect(services.layers.thumbnail).not.toHaveBeenCalled();
      setMode('live');
      flush();
      expect(services.layers.wantThumbnails).toHaveBeenCalledOnce();
      setMode('edit');
      flush();
      expect(release).not.toHaveBeenCalled();
      setMode('preview');
      flush();
      expect(release).toHaveBeenCalledOnce();
      expect(services.layers.action).not.toHaveBeenCalled();
    }
  );

  it('shows the drawing in layers:strip and the prototype in layers:strip-prototype', () => {
    const definition = partDefinition('layers:strip-prototype')!;
    expect(definition).toMatchObject({ label: 'Layers strip (prototype)', section: 'Layers', stretch: 'rows' });
    expect(definition.looks?.auto({ width: 180, height: 240 })).toBe('wide');

    const { services } = owned(createTestServices);
    mountView(() => (
      <LegoServicesContext value={services}>
        <PartFrame kind="layers:strip" span={{ columns: 2, rows: 8 }} immediate />
        <PartFrame kind="layers:strip-prototype" span={{ columns: 2, rows: 8 }} immediate />
      </LegoServicesContext>
    ));

    const [real, prototype] = [...document.querySelectorAll('[data-layers-strip]')];
    expect([...real!.querySelectorAll('[data-layer-tile]')].map((tile) => tile.getAttribute('aria-label'))).toEqual([
      'Layer 1'
    ]);
    expect(prototype!.querySelector('[data-layer-tile="layer-glow"]')).not.toBeNull();
    expect(prototype!.querySelector('[aria-label="New group"]')).not.toBeNull();
  });
});

/**
 * A fake `services.layers` over a paint-core document seeded with `layers` (bottom first), whose actions apply to the
 * document as the engine would, and the drawing model over it with `send` as the part's command.
 */
function seeded(layers = fourLayers, thumbnails: () => boolean = () => false, ready: () => boolean = () => true) {
  const drawing = seededDocument(layers);
  const [state, setState] = createSignal(drawing.state());
  const [maskView, setMaskView] = createSignal<MaskView>({ overlay: false, paint: 'reveal' });
  const fake: LegoServices['layers'] = {
    state,
    ready: createMemo(ready),
    wantThumbnails: vi.fn(() => () => {}),
    thumbnail: vi.fn((id: string) => `blob:${id}`),
    action: vi.fn((action: LayerAction) => {
      if (action.type !== 'merge-down' && action.type !== 'apply-mask') {
        drawing.changeLayer(action);
        // As the engine does: a new mask shows its red overlay.
        if (action.type === 'add-mask') {
          setMaskView((view) => ({ ...view, overlay: true }));
        }

        setState(drawing.state());
      }
    }),
    blending: vi.fn(),
    maskView,
    maskCommand: vi.fn((command: Parameters<LegoServices['layers']['maskCommand']>[0]) =>
      setMaskView((view) =>
        command.type === 'mask-overlay' ? { ...view, overlay: command.enabled } : { ...view, paint: command.paint }
      )
    )
  };
  const model = createDocumentLayers({ layers: fake, send: fake.action, view: fake.maskCommand, thumbnails });
  const byName = (name: string) => drawing.state().layers.find((layer) => layer.name === name)?.id ?? '';
  const ids = {
    flat: byName('Flat colors'),
    shadows: byName('Shadows'),
    ink: byName('Ink'),
    sketch: byName('Sketch'),
    only: byName('Only')
  };
  return { model, layers: fake, ids };
}

function mountStrip(model: LayersModel) {
  mountView(() => <LayersStripPart model={model} wide={false} interactive acquireThumbnails />);
}

function mountView(view: Parameters<typeof render>[0]) {
  const host = document.createElement('div');
  document.body.append(host);
  disposers.push(render(view, host));
  flush();
}

function owned<T>(create: () => T) {
  return createRoot((dispose) => {
    disposers.push(dispose);
    return create();
  });
}

function tiles() {
  return [...document.querySelectorAll<HTMLElement>('[data-layer-tile]')].map((tile) =>
    tile.getAttribute('aria-label')
  );
}

function tile(id: string) {
  return document.querySelector<HTMLElement>(`[data-layer-tile="${id}"]`)!;
}

function pointer(
  target: EventTarget,
  type: string,
  options: { x?: number; y?: number; pointerId?: number; pointerType?: 'touch' | 'pen' | 'mouse' } = {}
) {
  const event = new MouseEvent(type, {
    clientX: options.x ?? 0,
    clientY: options.y ?? 0,
    button: 0,
    bubbles: true,
    cancelable: true
  });
  Object.defineProperties(event, {
    pointerId: { value: options.pointerId ?? 1 },
    pointerType: { value: options.pointerType ?? 'pen' }
  });
  target.dispatchEvent(event);
  flush();
}
