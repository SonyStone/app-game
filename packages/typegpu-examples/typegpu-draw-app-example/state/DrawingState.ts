/**
 * TypeGPU Drawing Framework - Drawing State
 *
 * Centralized state management using SolidJS signals.
 * All drawing-related state is managed here.
 */

import { batch, createMemo, createSignal } from 'solid-js';
import { createStore, produce } from 'solid-js/store';
import type {
  BlendMode,
  BrushSettings,
  CanvasTransform,
  ColorBlendMode,
  Layer,
  LayerState,
  StrokePoint
} from '../core/types';

// ============================================================================
// MARK: Default Values
// ============================================================================

export const DEFAULT_BRUSH_SETTINGS: BrushSettings = {
  color: '#000000',
  size: 20,
  opacity: 1,
  hardness: 0.5,
  spacing: 25
};

export const DEFAULT_TRANSFORM: CanvasTransform = {
  panX: 0,
  panY: 0,
  zoom: 1,
  rotation: 0
};

export const DEFAULT_LAYER: Omit<Layer, 'id' | 'texture'> = {
  name: 'Layer',
  visible: true,
  opacity: 1,
  blendMode: 'normal',
  locked: false
};

// ============================================================================
// MARK: Tool State
// ============================================================================

export interface ToolState {
  /** Currently selected tool */
  currentTool: 'brush' | 'eraser' | 'pan' | 'zoom';
  /** Current brush ID */
  currentBrushId: string;
  /** Current blend mode */
  blendMode: BlendMode;
  /** Current color blend mode */
  colorBlendMode: ColorBlendMode;
  /** Brush settings */
  brush: BrushSettings;
}

export function createToolState(initial?: Partial<ToolState>) {
  const [state, setState] = createStore<ToolState>({
    currentTool: initial?.currentTool ?? 'brush',
    currentBrushId: initial?.currentBrushId ?? 'soft-round',
    blendMode: initial?.blendMode ?? 0, // NORMAL
    colorBlendMode: initial?.colorBlendMode ?? 0, // GAMMA
    brush: { ...DEFAULT_BRUSH_SETTINGS, ...initial?.brush }
  });

  return {
    state,

    // Setters
    setTool: (tool: ToolState['currentTool']) => setState('currentTool', tool),
    setBrushId: (id: string) => setState('currentBrushId', id),
    setBlendMode: (mode: BlendMode) => setState('blendMode', mode),
    setColorBlendMode: (mode: ColorBlendMode) => setState('colorBlendMode', mode),

    // Brush settings
    setBrushColor: (color: string) => setState('brush', 'color', color),
    setBrushSize: (size: number) => setState('brush', 'size', size),
    setBrushOpacity: (opacity: number) => setState('brush', 'opacity', opacity),
    setBrushHardness: (hardness: number) => setState('brush', 'hardness', hardness),
    setBrushSpacing: (spacing: number) => setState('brush', 'spacing', spacing),
    setBrushSettings: (settings: Partial<BrushSettings>) =>
      setState(
        'brush',
        produce((brush) => Object.assign(brush, settings))
      )
  };
}

// ============================================================================
// MARK: Canvas State
// ============================================================================

export interface CanvasState {
  /** Canvas dimensions */
  width: number;
  height: number;
  /** Display dimensions */
  displayWidth: number;
  displayHeight: number;
  /** Background color (hex) */
  backgroundColor: string;
  /** Transform state */
  transform: CanvasTransform;
}

export function createCanvasState(initial?: Partial<CanvasState>) {
  const [state, setState] = createStore<CanvasState>({
    width: initial?.width ?? 4000,
    height: initial?.height ?? 4000,
    displayWidth: initial?.displayWidth ?? 800,
    displayHeight: initial?.displayHeight ?? 600,
    backgroundColor: initial?.backgroundColor ?? '#ffffff',
    transform: { ...DEFAULT_TRANSFORM, ...initial?.transform }
  });

  // Computed values
  const aspectRatio = createMemo(() => state.width / state.height);
  const displayAspectRatio = createMemo(() => state.displayWidth / state.displayHeight);

  return {
    state,
    aspectRatio,
    displayAspectRatio,

    // Setters
    setDimensions: (width: number, height: number) =>
      batch(() => {
        setState('width', width);
        setState('height', height);
      }),

    setDisplayDimensions: (width: number, height: number) =>
      batch(() => {
        setState('displayWidth', width);
        setState('displayHeight', height);
      }),

    setBackgroundColor: (color: string) => setState('backgroundColor', color),

    // Transform
    setTransform: (transform: CanvasTransform) => setState('transform', transform),
    setPan: (x: number, y: number) =>
      batch(() => {
        setState('transform', 'panX', x);
        setState('transform', 'panY', y);
      }),
    setZoom: (zoom: number) => setState('transform', 'zoom', zoom),
    setRotation: (rotation: number) => setState('transform', 'rotation', rotation),

    // Convenience methods
    resetTransform: () => setState('transform', DEFAULT_TRANSFORM),

    updateTransform: (partial: Partial<CanvasTransform>) =>
      setState(
        'transform',
        produce((t) => Object.assign(t, partial))
      )
  };
}

// ============================================================================
// MARK: Layer State
// ============================================================================

export function createLayerState(initial?: Partial<LayerState>) {
  const [state, setState] = createStore<LayerState>({
    layers: initial?.layers ?? [],
    activeLayerId: initial?.activeLayerId ?? null
  });

  // Computed values
  const activeLayer = createMemo(() => state.layers.find((l) => l.id === state.activeLayerId) ?? null);

  const visibleLayers = createMemo(() => state.layers.filter((l) => l.visible));

  const layerCount = createMemo(() => state.layers.length);

  return {
    state,
    activeLayer,
    visibleLayers,
    layerCount,

    // Layer management
    addLayer: (layer: Layer) => {
      setState('layers', (layers) => [...layers, layer]);
      setState('activeLayerId', layer.id);
    },

    removeLayer: (id: string) => {
      const index = state.layers.findIndex((l) => l.id === id);
      if (index === -1) return;

      setState('layers', (layers) => layers.filter((l) => l.id !== id));

      // Select another layer if active was removed
      if (state.activeLayerId === id) {
        const newActive = state.layers[Math.min(index, state.layers.length - 1)]?.id ?? null;
        setState('activeLayerId', newActive);
      }
    },

    setActiveLayer: (id: string) => setState('activeLayerId', id),

    updateLayer: (id: string, updates: Partial<Layer>) => {
      const index = state.layers.findIndex((l) => l.id === id);
      if (index === -1) return;
      setState(
        'layers',
        index,
        produce((layer) => Object.assign(layer, updates))
      );
    },

    moveLayer: (id: string, newIndex: number) => {
      const currentIndex = state.layers.findIndex((l) => l.id === id);
      if (currentIndex === -1 || newIndex < 0 || newIndex >= state.layers.length) return;

      setState(
        'layers',
        produce((layers) => {
          const [layer] = layers.splice(currentIndex, 1);
          layers.splice(newIndex, 0, layer);
        })
      );
    },

    setLayerVisibility: (id: string, visible: boolean) => {
      const index = state.layers.findIndex((l) => l.id === id);
      if (index !== -1) setState('layers', index, 'visible', visible);
    },

    setLayerOpacity: (id: string, opacity: number) => {
      const index = state.layers.findIndex((l) => l.id === id);
      if (index !== -1) setState('layers', index, 'opacity', opacity);
    },

    setLayerBlendMode: (id: string, blendMode: Layer['blendMode']) => {
      const index = state.layers.findIndex((l) => l.id === id);
      if (index !== -1) setState('layers', index, 'blendMode', blendMode);
    }
  };
}

// ============================================================================
// MARK: Stroke State
// ============================================================================

export interface StrokeState {
  /** Is a stroke currently in progress? */
  inProgress: boolean;
  /** Pending stroke points to be rendered */
  pendingPoints: StrokePoint[];
  /** Current stroke ID (for undo/redo) */
  currentStrokeId: string | null;
}

export function createStrokeState() {
  const [inProgress, setInProgress] = createSignal(false);
  const [pendingPoints, setPendingPoints] = createSignal<StrokePoint[]>([]);
  const [currentStrokeId, setCurrentStrokeId] = createSignal<string | null>(null);

  return {
    // Accessors
    inProgress,
    pendingPoints,
    currentStrokeId,

    // Actions
    startStroke: () => {
      setInProgress(true);
      setCurrentStrokeId(crypto.randomUUID());
    },

    addPoints: (points: StrokePoint[]) => {
      setPendingPoints((prev) => [...prev, ...points]);
    },

    consumePoints: (): StrokePoint[] => {
      const points = pendingPoints();
      setPendingPoints([]);
      return points;
    },

    endStroke: () => {
      setInProgress(false);
    },

    clear: () => {
      setInProgress(false);
      setPendingPoints([]);
      setCurrentStrokeId(null);
    }
  };
}

// ============================================================================
// MARK: Combined Drawing State
// ============================================================================

export interface DrawingState {
  tool: ReturnType<typeof createToolState>;
  canvas: ReturnType<typeof createCanvasState>;
  layers: ReturnType<typeof createLayerState>;
  stroke: ReturnType<typeof createStrokeState>;
}

export function createDrawingState(options?: {
  tool?: Partial<ToolState>;
  canvas?: Partial<CanvasState>;
  layers?: Partial<LayerState>;
}): DrawingState {
  return {
    tool: createToolState(options?.tool),
    canvas: createCanvasState(options?.canvas),
    layers: createLayerState(options?.layers),
    stroke: createStrokeState()
  };
}
