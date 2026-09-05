import type { ViewportMode } from '../../shared/viewportMode';
import { createDefaultCamera } from '../../render/cameraDefaults';
import { createSignal } from 'solid-js';
import { expect, it, vi } from 'vitest';
import { createInitialDocument, type Stroke, type StrokeId, type StrokePointKey } from '../../document';
import type { ToolMode } from '../../shared/toolMode';
import { useCanvasInteraction } from './useCanvasInteraction';
import type { InteractionViewport } from './viewportPort';

it('cancels a draft when two fingers take over, and starts a fresh stroke after they lift', () => {
  const state = setup();
  state.interaction.onPointerDown(pointer(1, 10, 10));
  state.interaction.onPointerMove(pointer(1, 40, 40));
  expect(state.draft()).toBeDefined();
  state.interaction.onPointerDown(pointer(2, 120, 10));
  expect(state.draft()).toBeUndefined();
  state.interaction.onPointerUp(pointer(2, 120, 10));
  state.interaction.onPointerMove(pointer(1, 80, 90));
  state.interaction.onPointerUp(pointer(1, 80, 90));
  expect(state.document().drawings[0].strokes).toHaveLength(0);
  state.interaction.onPointerDown(pointer(3, 10, 10));
  state.interaction.onPointerUp(pointer(3, 10, 10));
  expect(state.document().drawings[0].strokes).toHaveLength(1);
});

it('restores erased marks if a touch erase becomes a navigation gesture', () => {
  const state = setup();
  state.interaction.onPointerDown(pointer(1, 10, 10));
  state.interaction.onPointerMove(pointer(1, 100, 10));
  state.interaction.onPointerUp(pointer(1, 100, 10));
  const before = state.document();
  state.setMode('erase');
  state.interaction.onPointerDown(pointer(2, 10, 10));
  expect(state.document()).not.toEqual(before);
  state.interaction.onPointerDown(pointer(3, 80, 50));
  state.interaction.onPointerUp(pointer(2, 10, 10));
  state.interaction.onPointerUp(pointer(3, 80, 50));
  expect(state.document()).toEqual(before);
});

it('ignores palm cancellation while a pen stroke is in progress', () => {
  const state = setup();
  state.interaction.onPointerDown(pointer(1, 10, 10, 'pen'));
  state.interaction.onPointerDown(pointer(2, 80, 40));
  state.interaction.onPointerCancel(pointer(2, 80, 40));
  expect(state.draft()).toBeDefined();
  state.interaction.onPointerMove(pointer(1, 60, 60, 'pen'));
  state.interaction.onPointerUp(pointer(1, 60, 60, 'pen'));
  expect(state.document().drawings[0].strokes).toHaveLength(1);
});

it('pans with one finger in 2D in every tool, while pen and mouse still draw', () => {
  const state = setup('2d');
  const before = state.document();
  for (const tool of ['draw', 'fill', 'select', 'edit', 'erase', 'orbit', 'pan'] as const) {
    state.setMode(tool);
    state.interaction.onPointerDown(pointer(1, 10, 10));
    state.interaction.onPointerMove(pointer(1, 40, 55));
    state.interaction.onPointerUp(pointer(1, 40, 55));
    expect(state.draft()).toBeUndefined();
    expect(state.document()).toEqual(before);
    expect(state.renderer.transformTouch).toHaveBeenLastCalledWith({
      from: { x: 10, y: 10 }, to: { x: 40, y: 55 }, scale: 1, rotation: 0
    });
  }
  expect(state.renderer.orbit).not.toHaveBeenCalled();
  state.setMode('draw');
  for (const type of ['pen', 'mouse']) {
    state.interaction.onPointerDown(pointer(2, 10, 10, type));
    state.interaction.onPointerMove(pointer(2, 40, 55, type));
    state.interaction.onPointerUp(pointer(2, 40, 55, type));
  }
  expect(state.document().drawings[0].strokes).toHaveLength(2);
});

function setup(viewport: ViewportMode = '3d') {
  const [document, setDocument] = createSignal(createInitialDocument());
  const [draft, setDraft] = createSignal<Stroke>();
  const [mode, setMode] = createSignal<ToolMode>('draw');
  const [strokes, setStrokes] = createSignal<ReadonlySet<StrokeId>>(new Set());
  const [points, setPoints] = createSignal<ReadonlySet<StrokePointKey>>(new Set());
  const [, setLabel] = createSignal('Ready');
  const renderer = {
    orbit: vi.fn(),
    pan: vi.fn(),
    zoom: vi.fn(),
    transformTouch: vi.fn(),
    screenToWorld: (x, y) => [x * 0.01, y * 0.01, 0],
    worldUnitsPerPixel: () => 0.01,
    projectToScreen: () => undefined,
    offsetFromWorkplane: (position) => position,
    setWorkplaneGizmoHighlight: vi.fn()
  } satisfies InteractionViewport;
  const interaction = useCanvasInteraction({
    camera: createDefaultCamera,
    canvas: () => ({ setPointerCapture: vi.fn() }) as unknown as HTMLCanvasElement,
    renderer: () => renderer,
    mode,
    viewportMode: () => viewport,
    gizmoMode: () => 'translate',
    touchDrawing: () => true,
    documentState: document,
    activeLayer: () => document().layers[0],
    activeDrawing: () => document().drawings[0],
    activeMaterial: () => document().materials[0],
    workplane: () => document().workplane,
    currentFrame: () => 1,
    brushStrength: () => 1,
    eraserRadius: () => 0.2,
    draftStroke: draft,
    setDraftStroke: setDraft,
    selectedStrokeIds: strokes,
    setSelectedStrokeIds: setStrokes,
    selectedPointKeys: points,
    setSelectedPointKeys: setPoints,
    selectedStrokeCount: () => strokes().size,
    selectedPointCount: () => points().size,
    setDocumentState: setDocument,
    setPointerLabel: setLabel
  });
  return { interaction, document, draft, setMode, renderer };
}

function pointer(pointerId: number, clientX: number, clientY: number, pointerType = 'touch') {
  return {
    pointerId,
    clientX,
    clientY,
    pointerType,
    pressure: 0.7,
    button: 0,
    buttons: 1,
    timeStamp: 0
  } as PointerEvent;
}
