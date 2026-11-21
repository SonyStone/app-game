// @vitest-environment jsdom
import { render } from '@solidjs/web';
import { createRoot, flush } from 'solid-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { maxSpan, resizePart } from '../board';
import { createGrid, defaultCell, GridContext } from '../grid';
import { partDefinition } from '../parts';
import { FolderButtonPart, LayerOpenerPart } from './LayerOpenerPart';
import { LayersStripPart } from './LayersStripPart';
import { findNode, psdBlendModes } from './layersModel';
import { createMockLayers, prototypeLayersModel, type MockLayersService } from './mockLayers';

let dispose: (() => void) | undefined;

afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.replaceChildren();
  vi.useRealTimers();
});

function pointerEvent(
  target: EventTarget,
  type: string,
  options: {
    x?: number;
    y?: number;
    pointerId?: number;
    pointerType?: 'touch' | 'pen' | 'mouse';
    button?: number;
  } = {}
) {
  const event = new MouseEvent(type, {
    clientX: options.x ?? 0,
    clientY: options.y ?? 0,
    button: options.button ?? 0,
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

function mountStrip(service: MockLayersService, wide = false, interactive = true) {
  dispose = render(
    () => <LayersStripPart model={prototypeLayersModel(service)} wide={wide} interactive={interactive} />,
    document.body
  );
  flush();
}

function createTestLayers() {
  return createRoot((stop) => {
    dispose = stop;
    return createMockLayers();
  });
}

describe('mockLayers', () => {
  it('seeds a realistic PSD layer tree with 27 layer blend modes plus Pass Through and SVG thumbnails', () => {
    const service = createTestLayers();
    expect(psdBlendModes).toHaveLength(28);
    expect(psdBlendModes.filter((mode) => !mode.groupOnly)).toHaveLength(27);
    expect(service.totalCount()).toBe(10);
    expect(service.layers().map((node) => node.name)).toEqual(['Glow', 'Curves', 'Character', 'Background']);

    const character = findNode(service.layers(), 'group-character')!;
    expect(character.type).toBe('group');
    expect(character.blend).toBe('pass-through');
    expect(character.children?.map((child) => child.name)).toEqual(['Highlight', 'Shading', 'Face', 'Lineart']);

    const glow = findNode(service.layers(), 'layer-glow')!;
    expect(glow.blend).toBe('screen');
    expect(glow.opacity).toBe(75);
    expect(glow.colorTag).toBe('none');
    expect(glow.mask).toBeDefined();
    expect(glow.thumb!.startsWith('data:image/svg+xml;utf8,')).toBe(true);
    expect(glow.mask!.thumb!.startsWith('data:image/svg+xml;utf8,')).toBe(true);
    expect(service.layers().every((node) => node.colorTag === 'none')).toBe(true);
  });

  it('supports layer CRUD, masks, Rubylith, Solo, multi-select, grouping, reorder/clip, Paper, and 30-step Undo/Redo', () => {
    const service = createTestLayers();

    // Add & update.
    service.addLayer();
    flush();
    const addedId = service.activeId();
    expect(service.totalCount()).toBe(11);

    service.update(addedId, { blend: 'overlay', opacity: 42, fill: 80, clipping: true, reference: true });
    flush();
    const updated = findNode(service.layers(), addedId)!;
    expect(updated.blend).toBe('overlay');
    expect(updated.opacity).toBe(42);
    expect(updated.fill).toBe(80);
    expect(updated.clipping).toBe(true);
    expect(updated.reference).toBe(true);

    // Mask lifecycle & Rubylith.
    service.addMask(addedId);
    flush();
    expect(service.target()).toBe('mask');
    expect(findNode(service.layers(), addedId)?.mask?.enabled).toBe(true);
    service.toggleMaskEnabled(addedId);
    flush();
    expect(findNode(service.layers(), addedId)?.mask?.enabled).toBe(false);
    service.invertMask(addedId);
    flush();
    expect(findNode(service.layers(), addedId)?.mask?.inverted).toBe(true);
    const beforeRuby = service.maskOverlay();
    service.toggleRubylith();
    flush();
    expect(service.maskOverlay()).toBe(!beforeRuby);
    service.setMaskBrush('hide');
    flush();
    expect(service.maskBrush()).toBe('hide');
    service.deleteMask(addedId);
    flush();
    expect(findNode(service.layers(), addedId)?.mask).toBeUndefined();
    expect(service.target()).toBe('layer');

    // Solo & Favorite blend modes.
    service.toggleSolo(addedId);
    flush();
    expect(service.soloId()).toBe(addedId);
    service.toggleSolo(addedId);
    flush();
    expect(service.soloId()).toBeUndefined();

    service.toggleFavoriteBlend('color-dodge');
    flush();
    expect(service.favoriteBlends()).toContain('color-dodge');
    service.toggleFavoriteBlend('color-dodge');
    flush();
    expect(service.favoriteBlends()).not.toContain('color-dodge');

    // Group drill-in & moveOutOfGroup.
    service.enterGroup('group-character');
    flush();
    expect(service.groupStack()).toEqual(['group-character']);
    service.moveOutOfGroup('layer-highlight');
    flush();
    expect(service.groupStack()).toEqual([]);
    expect(service.layers().some((node) => node.id === 'layer-highlight')).toBe(true);

    // Cycle guard: cannot drop parent group into its own child group.
    const beforeCycle = service.totalCount();
    service.reorder('group-character', 'group-face', 'into');
    flush();
    expect(service.totalCount()).toBe(beforeCycle);
    expect(findNode(service.layers(), 'group-character')).toBeDefined();

    // Clip drop sets clipping flag and places dragged layer right above target.
    service.reorder('layer-glow', 'layer-background', 'clip');
    flush();
    const glow = findNode(service.layers(), 'layer-glow')!;
    expect(glow.clipping).toBe(true);

    // Paper settings.
    service.setPaper({ color: '#26282e', label: 'Dark', visible: false });
    flush();
    expect(service.paper()).toEqual({ color: '#26282e', label: 'Dark', visible: false });

    // Undo / Redo & Reset demo.
    expect(service.canUndo()).toBe(true);
    const countBeforeUndo = service.totalCount();
    service.delete([addedId]);
    flush();
    expect(service.totalCount()).toBe(countBeforeUndo - 1);
    service.undo();
    flush();
    expect(service.totalCount()).toBe(countBeforeUndo);
    expect(service.canRedo()).toBe(true);
    service.redo();
    flush();
    expect(service.totalCount()).toBe(countBeforeUndo - 1);

    service.resetDemo();
    flush();
    expect(service.totalCount()).toBe(10);
    expect(service.canUndo()).toBe(false);
  });

  it('caps local Undo history at 30 steps', () => {
    const service = createTestLayers();
    for (let i = 0; i < 35; i += 1) {
      service.addLayer();
    }
    flush();

    let undone = 0;
    while (service.canUndo()) {
      service.undo();
      flush();
      undone += 1;
    }

    expect(undone).toBe(30);
  });
});

describe('LayersStripPart', () => {
  it('switches between narrow strip drill-in and wide indented tree with side-by-side mask thumbnails', () => {
    const service = createMockLayers();

    // 1) Strip mode: top-level tiles only, drill into Character group, then ‹ Back.
    mountStrip(service, false);
    expect(document.querySelectorAll('[data-layer-tile]')).toHaveLength(4);
    expect(document.querySelector('[data-layer-tile="layer-shading"]')).toBeNull();

    document.querySelector<HTMLButtonElement>('[aria-label="Open group Character"]')!.click();
    flush();
    expect(service.groupStack()).toEqual(['group-character']);
    expect(document.querySelector('[data-layers-back]')?.textContent).toContain('Character');
    expect(document.querySelector('[data-layer-tile="layer-shading"]')).not.toBeNull();

    document.querySelector<HTMLButtonElement>('[data-layers-back]')!.click();
    flush();
    expect(service.groupStack()).toEqual([]);

    dispose?.();
    document.body.replaceChildren();

    // 2) Wide mode: indented tree expanded by default with side-by-side mask thumbnail for Blush and Glow.
    mountStrip(service, true);
    expect(document.querySelector('[data-layer-tile="layer-shading"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="Select mask for Blush"]')).not.toBeNull();

    document.querySelector<HTMLButtonElement>('[aria-label="Select mask for Blush"]')!.click();
    flush();
    expect(service.activeId()).toBe('layer-blush');
    expect(service.target()).toBe('mask');

    // Collapse Character hides its children in wide mode.
    document.querySelector<HTMLButtonElement>('[aria-label="Collapse Character"]')!.click();
    flush();
    expect(document.querySelector('[data-layer-tile="layer-shading"]')).toBeNull();
  });

  it('toggles layer/mask via corner badge and left swipe, and activates Solo on long-press of the eye', () => {
    vi.useFakeTimers();
    const service = createMockLayers();
    mountStrip(service, false);

    // Mask corner click toggles mask target on Glow.
    const maskBtn = document.querySelector<HTMLButtonElement>('[aria-label="Toggle mask target for Glow"]')!;
    maskBtn.click();
    flush();
    expect(service.activeId()).toBe('layer-glow');
    expect(service.target()).toBe('mask');

    // Left swipe on Glow toggles back from mask → layer.
    const glowTile = document.querySelector<HTMLElement>('[data-layer-tile="layer-glow"]')!;
    pointerEvent(glowTile, 'pointerdown', { x: 80, y: 40, pointerId: 2, pointerType: 'touch' });
    pointerEvent(window, 'pointermove', { x: 20, y: 40, pointerId: 2, pointerType: 'touch' });
    pointerEvent(window, 'pointerup', { x: 20, y: 40, pointerId: 2, pointerType: 'touch' });
    expect(service.target()).toBe('layer');

    // Long-press eye button enables Solo.
    const eyeBtn = document.querySelector<HTMLButtonElement>('[aria-label="Toggle visibility for Glow"]')!;
    pointerEvent(eyeBtn, 'pointerdown', { x: 10, y: 10, pointerId: 3, pointerType: 'touch' });
    vi.advanceTimersByTime(450);
    flush();
    pointerEvent(eyeBtn, 'pointerup', { x: 10, y: 10, pointerId: 3, pointerType: 'touch' });
    expect(service.soloId()).toBe('layer-glow');
  });

  it('opens native LEGO LayerPropertiesPopover via second tap, 480ms hold, active tab button, or right-click, follows selection without flicker, and uses native sliders across all subpages', () => {
    vi.useFakeTimers();
    const service = createMockLayers();
    service.select('layer-glow', 'layer');
    flush();
    mountStrip(service, false);

    // 1) A 300ms touch tap (past 220ms arm, before 480ms hold) is NOT eaten by drag — it acts as a clean tap.
    const glowTile = document.querySelector<HTMLElement>('[data-layer-tile="layer-glow"]')!;
    pointerEvent(glowTile, 'pointerdown', { x: 20, y: 20, pointerId: 4, pointerType: 'touch' });
    vi.advanceTimersByTime(300);
    flush();
    expect(glowTile.hasAttribute('data-armed')).toBe(true);
    expect(glowTile.hasAttribute('data-dragging')).toBe(false);
    pointerEvent(window, 'pointerup', { x: 20, y: 20, pointerId: 4, pointerType: 'touch' });

    const popover = document.querySelector<HTMLElement>('[role="dialog"][aria-label="Layer properties: Glow"]')!;
    expect(popover).not.toBeNull();
    expect(glowTile.hasAttribute('data-open')).toBe(true);

    // Zero native <input type="range"> elements: uses native LEGO pointer slider instead.
    expect(popover.querySelector('input[type="range"]')).toBeNull();
    const opacitySlider = popover.querySelector<HTMLElement>('[role="slider"][aria-label="Opacity"]')!;
    expect(opacitySlider).not.toBeNull();
    opacitySlider.getBoundingClientRect = () => new DOMRect(0, 0, 200, 34);
    pointerEvent(opacitySlider, 'pointerdown', { x: 80, y: 17, pointerId: 5, pointerType: 'pen' });
    pointerEvent(window, 'pointerup', { x: 80, y: 17, pointerId: 5, pointerType: 'pen' });
    expect(findNode(service.layers(), 'layer-glow')?.opacity).toBe(40);

    // 2) Subpage: Blending (27 modes + vertical Opacity and Fill sliders).
    popover.querySelector<HTMLButtonElement>('[aria-label="Open blend modes"]')!.click();
    flush();
    const fillSlider = popover.querySelector<HTMLElement>('[role="slider"][aria-label="Fill"]')!;
    expect(fillSlider).not.toBeNull();
    fillSlider.getBoundingClientRect = () => new DOMRect(0, 0, 34, 200);
    pointerEvent(fillSlider, 'pointerdown', { x: 17, y: 50, pointerId: 6, pointerType: 'pen' });
    pointerEvent(window, 'pointerup', { x: 17, y: 50, pointerId: 6, pointerType: 'pen' });
    expect(findNode(service.layers(), 'layer-glow')?.fill).toBe(75);

    const options = [...popover.querySelectorAll<HTMLButtonElement>('[role="option"]')];
    expect(options.length).toBeGreaterThanOrEqual(27);
    options.find((btn) => btn.textContent?.includes('Overlay'))!.click();
    flush();
    expect(findNode(service.layers(), 'layer-glow')?.blend).toBe('overlay');

    // Back to main -> open Mask subpage.
    popover.querySelector<HTMLButtonElement>('button')!.click();
    flush();
    popover.querySelector<HTMLButtonElement>('[aria-label="Open mask settings"]')!.click();
    flush();
    expect(popover.textContent).toContain('Invert mask');
    popover.querySelector<HTMLButtonElement>('button')!.click();
    flush();

    // Open Locks subpage.
    popover.querySelector<HTMLButtonElement>('[aria-label="Open Locks"]')!.click();
    flush();
    const lockPixelsBtn = [...popover.querySelectorAll<HTMLButtonElement>('button')].find(
      (btn) => btn.textContent?.trim() === 'Lock Pixels'
    )!;
    lockPixelsBtn.click();
    flush();
    expect(findNode(service.layers(), 'layer-glow')?.locks.pixels).toBe(true);
    popover.querySelector<HTMLButtonElement>('button')!.click();
    flush();

    // Open Color tag subpage.
    popover.querySelector<HTMLButtonElement>('[aria-label="Open Color tag"]')!.click();
    flush();
    popover.querySelector<HTMLButtonElement>('[aria-label="Tag Red"]')!.click();
    flush();
    expect(findNode(service.layers(), 'layer-glow')?.colorTag).toBe('red');
    popover.querySelector<HTMLButtonElement>('button')!.click();
    flush();

    // Open Blend If subpage -> tap black handle to split, then Reset.
    popover.querySelector<HTMLButtonElement>('[aria-label="Open Blend If"]')!.click();
    flush();
    popover.querySelector<HTMLButtonElement>('[aria-label="This Layer black handle"]')!.click();
    flush();
    const range = findNode(service.layers(), 'layer-glow')!.blendIf.thisLayer;
    expect(range[0]).not.toBe(range[1]);
    expect(popover.querySelector('[aria-label="This Layer black low"]')).not.toBeNull();
    expect(popover.querySelector('[aria-label="This Layer black high"]')).not.toBeNull();
    [...popover.querySelectorAll<HTMLButtonElement>('button')]
      .find((btn) => btn.textContent?.trim() === 'Reset')!
      .click();
    flush();
    expect(findNode(service.layers(), 'layer-glow')!.blendIf.thisLayer).toEqual([0, 0, 255, 255]);

    // 3) Popover follows selection when tapping another tile without closing.
    const curvesTile = document.querySelector<HTMLElement>('[data-layer-tile="layer-curves"]')!;
    pointerEvent(curvesTile, 'pointerdown', { x: 20, y: 20, pointerId: 7, pointerType: 'pen' });
    pointerEvent(window, 'pointerup', { x: 20, y: 20, pointerId: 7, pointerType: 'pen' });
    expect(service.activeId()).toBe('layer-curves');
    expect(document.querySelector('[role="dialog"][aria-label="Layer properties: Curves"]')).not.toBeNull();

    // Tapping the anchored tile again closes the popover cleanly without flicker.
    pointerEvent(curvesTile, 'pointerdown', { x: 20, y: 20, pointerId: 8, pointerType: 'pen' });
    pointerEvent(window, 'pointerup', { x: 20, y: 20, pointerId: 8, pointerType: 'pen' });
    expect(document.querySelector('[role="dialog"]')).toBeNull();

    // 4) Visible `⋯` button on the active tile opens properties, and 500ms hold opens properties directly.
    const propsBtn = document.querySelector<HTMLButtonElement>('[aria-label="Layer properties for Curves"]')!;
    expect(propsBtn).not.toBeNull();
    propsBtn.click();
    flush();
    expect(document.querySelector('[role="dialog"][aria-label="Layer properties: Curves"]')).not.toBeNull();
    propsBtn.click();
    flush();
    expect(document.querySelector('[role="dialog"]')).toBeNull();

    pointerEvent(glowTile, 'pointerdown', { x: 20, y: 20, pointerId: 9, pointerType: 'touch' });
    vi.advanceTimersByTime(500);
    flush();
    expect(document.querySelector('[role="dialog"][aria-label="Layer properties: Glow"]')).not.toBeNull();
    pointerEvent(window, 'pointerup', { x: 20, y: 20, pointerId: 9, pointerType: 'touch' });
    expect(document.querySelector('[role="dialog"][aria-label="Layer properties: Glow"]')).not.toBeNull();
  });

  it('groups layers on two-finger touch pinch with an Undo toast and supports right-swipe multi-select', () => {
    const service = createMockLayers();
    mountStrip(service, false);

    const glowTile = document.querySelector<HTMLElement>('[data-layer-tile="layer-glow"]')!;
    const curvesTile = document.querySelector<HTMLElement>('[data-layer-tile="layer-curves"]')!;

    // Two-finger pinch across Glow and Curves.
    pointerEvent(glowTile, 'pointerdown', { x: 30, y: 20, pointerId: 10, pointerType: 'touch' });
    pointerEvent(curvesTile, 'pointerdown', { x: 30, y: 120, pointerId: 11, pointerType: 'touch' });
    pointerEvent(window, 'pointermove', { x: 30, y: 55, pointerId: 10, pointerType: 'touch' });
    pointerEvent(window, 'pointermove', { x: 30, y: 75, pointerId: 11, pointerType: 'touch' });
    pointerEvent(window, 'pointerup', { x: 30, y: 55, pointerId: 10, pointerType: 'touch' });
    pointerEvent(window, 'pointerup', { x: 30, y: 75, pointerId: 11, pointerType: 'touch' });

    const toast = document.querySelector<HTMLElement>('[role="status"]');
    expect(toast?.textContent).toContain('Grouped 2 layers');
    expect(service.layers()[0]!.type).toBe('group');
    expect(service.layers()[0]!.children?.map((child) => child.id)).toEqual(['layer-glow', 'layer-curves']);

    // Clicking Undo on the toast ungroups them.
    toast!.querySelector<HTMLButtonElement>('button')!.click();
    flush();
    expect(service.layers().map((node) => node.id)).toEqual([
      'layer-glow',
      'layer-curves',
      'group-character',
      'layer-background'
    ]);

    // Right-swipe on Glow activates multi-select bar.
    const glowAfter = document.querySelector<HTMLElement>('[data-layer-tile="layer-glow"]')!;
    pointerEvent(glowAfter, 'pointerdown', { x: 10, y: 20, pointerId: 12, pointerType: 'touch' });
    pointerEvent(window, 'pointermove', { x: 60, y: 20, pointerId: 12, pointerType: 'touch' });
    pointerEvent(window, 'pointerup', { x: 60, y: 20, pointerId: 12, pointerType: 'touch' });
    expect(service.selectedIds()).toEqual(['layer-glow']);
    expect(document.querySelector('[role="toolbar"][aria-label="Selected layers"]')?.textContent).toContain('1 sel');
  });

  it('shows inline mask controls in strip and wide modes and lifts tiles for touch (220ms) and pen (6px) drags', () => {
    vi.useFakeTimers();
    const service = createMockLayers();
    service.select('layer-glow', 'mask');
    flush();

    // Narrow strip: compact B&W toggle, Red toggle, and exit button in the strip header.
    mountStrip(service, false);
    const stripMaskBar = document.querySelector<HTMLElement>('[role="toolbar"][aria-label="Mask controls"]')!;
    expect(stripMaskBar).not.toBeNull();
    stripMaskBar.querySelector<HTMLButtonElement>('[data-mask-brush="reveal"]')!.click();
    flush();
    expect(service.maskBrush()).toBe('hide');

    // Touch hold 220ms arms (`data-armed`), moving >= 10px begins drag (`data-dragging`); pen vertical drag >= 10px drags immediately.
    const curvesTile = document.querySelector<HTMLElement>('[data-layer-tile="layer-curves"]')!;
    pointerEvent(curvesTile, 'pointerdown', { x: 20, y: 20, pointerId: 20, pointerType: 'touch' });
    vi.advanceTimersByTime(225);
    flush();
    expect(curvesTile.hasAttribute('data-armed')).toBe(true);
    expect(curvesTile.hasAttribute('data-dragging')).toBe(false);
    pointerEvent(window, 'pointermove', { x: 20, y: 34, pointerId: 20, pointerType: 'touch' });
    expect(curvesTile.hasAttribute('data-dragging')).toBe(true);
    pointerEvent(window, 'pointerup', { x: 20, y: 34, pointerId: 20, pointerType: 'touch' });
    expect(curvesTile.hasAttribute('data-dragging')).toBe(false);

    pointerEvent(curvesTile, 'pointerdown', { x: 20, y: 20, pointerId: 21, pointerType: 'pen' });
    pointerEvent(window, 'pointermove', { x: 20, y: 34, pointerId: 21, pointerType: 'pen' });
    expect(curvesTile.hasAttribute('data-dragging')).toBe(true);
    pointerEvent(window, 'pointerup', { x: 20, y: 34, pointerId: 21, pointerType: 'pen' });

    // Wide mode: labeled Reveal / Hide buttons, Red toggle, and exit button.
    dispose?.();
    document.body.replaceChildren();
    mountStrip(service, true);
    const wideMaskBar = document.querySelector<HTMLElement>('[role="toolbar"][aria-label="Mask controls"]')!;
    const revealBtn = [...wideMaskBar.querySelectorAll<HTMLButtonElement>('button')].find(
      (btn) => btn.textContent?.trim() === 'Reveal'
    )!;
    revealBtn.click();
    flush();
    expect(service.maskBrush()).toBe('reveal');

    wideMaskBar.querySelector<HTMLButtonElement>('[aria-label="Exit mask mode"]')!.click();
    flush();
    expect(service.target()).toBe('layer');
  });

  it('allows stretching a layers:strip panel well past 10 rows (up to maxSpan = 36)', () => {
    expect(maxSpan).toBe(36);
    const parts = [{ id: 'strip', kind: 'layers:strip', cell: { column: 0, row: 0 }, span: { columns: 2, rows: 8 } }];
    const tall = resizePart(parts, 'strip', { columns: 2, rows: 24 });
    expect(tall[0]!.span).toEqual({ columns: 2, rows: 24 });

    const clamped = resizePart(parts, 'strip', { columns: 2, rows: 50 });
    expect(clamped[0]!.span).toEqual({ columns: 2, rows: maxSpan });
  });
});

describe('layers:opener, action:folder and registry definitions', () => {
  it('registers layers:strip, layers:opener, and action:folder with expected spans, looks, and owned panels', () => {
    const stripDef = partDefinition('layers:strip')!;
    expect(stripDef.defaultSpan).toEqual({ columns: 2, rows: 8 });
    expect(stripDef.looks?.auto({ width: 80, height: 240 })).toBe('strip');
    expect(stripDef.looks?.auto({ width: 180, height: 240 })).toBe('wide');

    const openerDef = partDefinition('layers:opener')!;
    expect(openerDef.defaultSpan).toEqual({ columns: 2, rows: 2 });
    expect(openerDef.owned?.parts).toHaveLength(1);
    expect(openerDef.owned?.parts[0]?.kind).toBe('layers:strip');

    const folderDef = partDefinition('action:folder')!;
    expect(folderDef.defaultSpan).toEqual({ columns: 1, rows: 1 });
    expect(folderDef.owned?.parts).toEqual([]);
  });

  it('renders LayerOpenerPart with layer count, mode/mask badge, and fires onOpen on click', () => {
    const service = createMockLayers();
    const onOpen = vi.fn();
    dispose = render(
      () => <LayerOpenerPart model={prototypeLayersModel(service)} open={false} onOpen={onOpen} />,
      document.body
    );
    flush();

    const button = document.querySelector<HTMLButtonElement>('button')!;
    expect(button.getAttribute('aria-label')).toBe('Layers (10)');
    expect(button.textContent).toContain('M 62%');

    // Switching to mask target on Glow changes badge to MASK and adds data-mask.
    service.select('layer-glow', 'mask');
    flush();
    expect(button.hasAttribute('data-mask')).toBe(true);
    expect(button.textContent).toContain('MASK');

    button.click();
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('renders FolderButtonPart and invokes onOpen when clicked', () => {
    const onOpen = vi.fn();
    const grid = createGrid(() => defaultCell);
    dispose = render(
      () => (
        <GridContext value={grid}>
          <FolderButtonPart span={{ columns: 2, rows: 1 }} open={true} onOpen={onOpen} />
        </GridContext>
      ),
      document.body
    );
    flush();

    const button = document.querySelector<HTMLButtonElement>('button[aria-label="Drawer button"]')!;
    expect(button.getAttribute('aria-expanded')).toBe('true');
    button.click();
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
