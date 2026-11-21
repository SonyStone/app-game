// @vitest-environment jsdom
import type { LayerAction } from '@app-game/paint-core/document';
import { render } from '@solidjs/web';
import { createMemo, createRoot, createSignal, flush } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fourLayers, seededDocument } from '../../../component-canvas/seededLayers';
import type { LegoServices } from '../LegoServices';
import { LegoServicesContext } from '../LegoServices';
import { PartFrame } from '../PartFrame';
import { partDefinition } from '../parts';
import type { PartMode } from '../parts/definition';
import { createTestServices } from '../testServices';
import { createDocumentLayers, reorderIndex } from './documentLayers';
import type { LayersModel } from './layersModel';
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

    expect(model.capabilities.blendModes.map((mode) => mode.id)).toEqual(['normal', 'multiply', 'screen', 'overlay']);
    expect(model.capabilities).toMatchObject({
      locks: ['alpha'],
      clipping: true,
      fill: false,
      blendIf: false,
      colorTags: false,
      reference: false,
      dropZones: ['before', 'after']
    });
    for (const feature of [
      'groups',
      'masks',
      'solo',
      'selection',
      'paper',
      'favoriteBlends',
      'clear',
      'localUndo'
    ] as const) {
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
      { type: 'add' },
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

  it('turns a drop above or below a tile into one engine reorder to the dropped place', () => {
    const order = [{ id: 'flat' }, { id: 'shadows' }, { id: 'ink' }, { id: 'sketch' }];

    expect(reorderIndex(order, 'flat', 'sketch', 'before')).toBe(3);
    expect(reorderIndex(order, 'flat', 'ink', 'after')).toBe(1);
    expect(reorderIndex(order, 'sketch', 'flat', 'after')).toBe(0);
    expect(reorderIndex(order, 'sketch', 'shadows', 'before')).toBe(2);
    expect(reorderIndex(order, 'ink', 'shadows', 'before')).toBeUndefined();
    expect(reorderIndex(order, 'ink', 'sketch', 'after')).toBeUndefined();
    expect(reorderIndex(order, 'ink', 'flat', 'into')).toBeUndefined();
    expect(reorderIndex(order, 'ink', 'missing', 'before')).toBeUndefined();

    const { model, ids } = owned(() => seeded());
    model.reorder(ids.flat, ids.ink, 'after');
    flush();
    expect(model.layers().map((node) => node.name)).toEqual(['Sketch', 'Ink', 'Flat colors', 'Shadows']);
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
  it('shows real layers and badges, and none of the group, mask, Solo, selection or Paper controls', () => {
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
    expect(document.querySelector('[aria-label="New group"]')).toBeNull();
    expect(document.querySelector('[aria-label^="Toggle mask target"]')).toBeNull();
    expect(document.querySelector('[aria-label^="Open group"]')).toBeNull();
    expect(document.querySelector('[aria-label="Paper settings"]')).toBeNull();

    // A right swipe selects nothing, and a long press on the eye only toggles visibility once released.
    pointer(tile(ids.ink), 'pointerdown', { x: 10, y: 20 });
    pointer(window, 'pointermove', { x: 70, y: 20 });
    pointer(window, 'pointerup', { x: 70, y: 20 });
    expect(document.querySelector('[aria-label="Selected layers"]')).toBeNull();

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
    expect(labels).toEqual(expect.arrayContaining(['αLock', '↳Clip', 'Dup', 'Merge', 'Delete']));
    for (const absent of ['◐Mask', 'Group', 'Clear']) {
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

  it('reorders by drag to the dropped place in one engine step', () => {
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

    expect(layers.action).toHaveBeenCalledExactlyOnceWith({ type: 'reorder', id: ids.flat, index: 3 });
    expect(model.layers().map((node) => node.name)).toEqual(['Flat colors', 'Sketch', 'Ink', 'Shadows']);

    // The right of a layer's middle is no clip drop here, only a drop above it: the engine cannot move and clip in
    // one step.
    vi.mocked(layers.action).mockClear();
    const ink = tile(ids.ink);
    ink.getBoundingClientRect = () => new DOMRect(0, 0, 60, 60);
    document.elementFromPoint = vi.fn(() => ink);
    pointer(tile(ids.shadows), 'pointerdown', { x: 30, y: 200 });
    pointer(window, 'pointermove', { x: 55, y: 100 });
    pointer(window, 'pointermove', { x: 55, y: 25 });
    expect(ink.getAttribute('data-drop')).toBe('before');
    pointer(window, 'pointerup', { x: 55, y: 25 });
    expect(layers.action).toHaveBeenCalledExactlyOnceWith({ type: 'reorder', id: ids.shadows, index: 1 });
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
      ['Merge', true],
      ['Delete', true]
    ]);
    expect(layers.action).not.toHaveBeenCalled();

    setReady(true);
    flush();
    expect(document.querySelector<HTMLButtonElement>('[aria-label="New layer"]')!.disabled).toBe(false);
  });

  it('never shows an undo toast of its own: pinching sends nothing', () => {
    const { model, ids, layers } = owned(() => seeded());
    mountStrip(model);

    pointer(tile(ids.sketch), 'pointerdown', { x: 30, y: 20, pointerId: 10, pointerType: 'touch' });
    pointer(tile(ids.ink), 'pointerdown', { x: 30, y: 120, pointerId: 11, pointerType: 'touch' });
    pointer(window, 'pointermove', { x: 30, y: 55, pointerId: 10, pointerType: 'touch' });
    pointer(window, 'pointermove', { x: 30, y: 75, pointerId: 11, pointerType: 'touch' });
    pointer(window, 'pointerup', { x: 30, y: 55, pointerId: 10, pointerType: 'touch' });
    pointer(window, 'pointerup', { x: 30, y: 75, pointerId: 11, pointerType: 'touch' });

    expect(document.querySelector('[role="status"]')).toBeNull();
    expect(layers.action).not.toHaveBeenCalled();
  });
});

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
  const fake: LegoServices['layers'] = {
    state,
    ready: createMemo(ready),
    wantThumbnails: vi.fn(() => () => {}),
    thumbnail: vi.fn((id: string) => `blob:${id}`),
    action: vi.fn((action: LayerAction) => {
      if (action.type !== 'merge-down') {
        drawing.changeLayer(action);
        setState(drawing.state());
      }
    }),
    blending: vi.fn()
  };
  const model = createDocumentLayers({ layers: fake, send: fake.action, thumbnails });
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
