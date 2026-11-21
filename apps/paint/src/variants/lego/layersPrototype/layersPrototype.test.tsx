// @vitest-environment jsdom
import { render } from '@solidjs/web';
import { createRoot, flush } from 'solid-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGrid, defaultCell, GridContext } from '../grid';
import { partDefinition } from '../parts';
import { FolderButtonPart, LayerOpenerPart } from './LayerOpenerPart';
import { LayersStripPart } from './LayersStripPart';
import { createMockLayers, findNode, psdBlendModes, type MockLayersService } from './mockLayers';

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
  dispose = render(() => <LayersStripPart service={service} wide={wide} interactive={interactive} />, document.body);
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
    expect(glow.mask).toBeDefined();
    expect(glow.thumb.startsWith('data:image/svg+xml;utf8,')).toBe(true);
    expect(glow.mask!.thumb.startsWith('data:image/svg+xml;utf8,')).toBe(true);
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

  it('opens second-tap LayerPropertiesPopover with Blend modes (27 modes + Favorites) and tap-to-split Blend If', () => {
    const service = createMockLayers();
    service.select('layer-glow', 'layer');
    mountStrip(service, false);

    // Second tap on active tile opens properties popover.
    const glowTile = document.querySelector<HTMLElement>('[data-layer-tile="layer-glow"]')!;
    pointerEvent(glowTile, 'pointerdown', { x: 20, y: 20, pointerId: 4, pointerType: 'pen' });
    pointerEvent(window, 'pointerup', { x: 20, y: 20, pointerId: 4, pointerType: 'pen' });

    const popover = document.querySelector<HTMLElement>('[role="dialog"][aria-label="Layer properties: Glow"]');
    expect(popover).not.toBeNull();

    // Open ‹ Blend modes page.
    popover!.querySelector<HTMLButtonElement>('[aria-label="Open blend modes"]')!.click();
    flush();
    expect(popover!.querySelector('[aria-label="Blend page opacity"]')).not.toBeNull();
    const options = [...popover!.querySelectorAll<HTMLButtonElement>('[role="option"]')];
    // Includes favorites + all 27 non-group PSD modes.
    expect(options.length).toBeGreaterThanOrEqual(27);

    const overlayOption = options.find((btn) => btn.textContent?.includes('Overlay'))!;
    overlayOption.click();
    flush();
    expect(findNode(service.layers(), 'layer-glow')?.blend).toBe('overlay');

    // Return to main, then open ‹ Blend If page and tap black handle to split it.
    popover!.querySelector<HTMLButtonElement>('button')!.click();
    flush();
    popover!.querySelector<HTMLButtonElement>('[aria-label="Open Blend If"]')!.click();
    flush();

    const blackHandle = popover!.querySelector<HTMLButtonElement>('[aria-label="This Layer black handle"]')!;
    blackHandle.click();
    flush();

    const range = findNode(service.layers(), 'layer-glow')!.blendIf.thisLayer;
    expect(range[0]).not.toBe(range[1]);
    expect(popover!.querySelector('[aria-label="This Layer black low"]')).not.toBeNull();
    expect(popover!.querySelector('[aria-label="This Layer black high"]')).not.toBeNull();

    // Reset restores [0, 0, 255, 255].
    const resetBtn = [...popover!.querySelectorAll<HTMLButtonElement>('button')].find(
      (btn) => btn.textContent?.trim() === 'Reset'
    )!;
    resetBtn.click();
    flush();
    expect(findNode(service.layers(), 'layer-glow')!.blendIf.thisLayer).toEqual([0, 0, 255, 255]);
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
    dispose = render(() => <LayerOpenerPart service={service} open={false} onOpen={onOpen} />, document.body);
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
