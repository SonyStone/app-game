/**
 * TypeGPU Drawing Framework - SolidJS Hooks
 *
 * Hooks for integrating the drawing engine with SolidJS components.
 */

import { createEffect, createSignal, on, onCleanup, type Accessor } from 'solid-js';
import { DrawingEngine, createDrawingEngine } from '../core/DrawingEngine';
import type { CanvasTransform, DrawingEngineConfig, Point2D, StrokePoint } from '../core/types';

// ============================================================================
// MARK: useDrawingEngine
// ============================================================================

export interface UseDrawingEngineOptions extends Omit<DrawingEngineConfig, 'canvas'> {
  /** Callback when engine is ready */
  onReady?: (engine: DrawingEngine) => void;
  /** Callback on error */
  onError?: (error: Error) => void;
}

export interface UseDrawingEngineResult {
  /** The drawing engine instance */
  engine: Accessor<DrawingEngine | null>;
  /** Whether the engine is ready */
  isReady: Accessor<boolean>;
  /** Any error that occurred */
  error: Accessor<Error | null>;
  /** Set the canvas element */
  setCanvas: (canvas: HTMLCanvasElement) => void;
}

/**
 * Hook to create and manage a DrawingEngine instance.
 */
export function useDrawingEngine(options: UseDrawingEngineOptions = {}): UseDrawingEngineResult {
  const [engine, setEngine] = createSignal<DrawingEngine | null>(null);
  const [isReady, setIsReady] = createSignal(false);
  const [error, setError] = createSignal<Error | null>(null);
  const [canvas, setCanvas] = createSignal<HTMLCanvasElement | null>(null);

  // Initialize engine when canvas is set
  createEffect(
    on(canvas, async (canvasEl) => {
      if (!canvasEl) return;

      // Clean up existing engine
      const existingEngine = engine();
      if (existingEngine) {
        existingEngine.destroy();
        setEngine(null);
        setIsReady(false);
      }

      try {
        const newEngine = createDrawingEngine();
        await newEngine.init({
          canvas: canvasEl,
          ...options
        });

        setEngine(newEngine);
        setIsReady(true);
        setError(null);

        options.onReady?.(newEngine);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        options.onError?.(error);
      }
    })
  );

  // Cleanup on unmount
  onCleanup(() => {
    engine()?.destroy();
  });

  return {
    engine,
    isReady,
    error,
    setCanvas
  };
}

// ============================================================================
// MARK: usePointerDrawing
// ============================================================================

export interface UsePointerDrawingOptions {
  /** The drawing engine */
  engine: Accessor<DrawingEngine | null>;
  /** Canvas element */
  canvas: Accessor<HTMLCanvasElement | undefined>;
  /** Transform accessor */
  transform: Accessor<CanvasTransform>;
  /** Canvas width */
  canvasWidth?: number;
  /** Canvas height */
  canvasHeight?: number;
  /** Brush size accessor */
  brushSize?: Accessor<number>;
  /** Brush spacing accessor (percentage) */
  brushSpacing?: Accessor<number>;
}

/**
 * Hook to handle pointer input for drawing.
 */
export function usePointerDrawing(options: UsePointerDrawingOptions) {
  const { engine, canvas, transform, canvasWidth = 4000, canvasHeight = 4000, brushSize, brushSpacing } = options;

  let lastPoint: Point2D | null = null;
  let distanceAccumulator = 0;

  const screenToCanvas = (x: number, y: number, canvasEl: HTMLCanvasElement): Point2D => {
    const rect = canvasEl.getBoundingClientRect();
    const t = transform();

    const ndcX = ((x - rect.left) / rect.width) * 2 - 1;
    const ndcY = -(((y - rect.top) / rect.height) * 2 - 1);

    const px = (t.panX / rect.width) * 2;
    const py = -(t.panY / rect.height) * 2;

    const unpannedX = ndcX - px;
    const unpannedY = ndcY - py;

    const displayAspect = rect.width / rect.height;
    const canvasAspect = canvasWidth / canvasHeight;

    let baseScale: number;
    if (displayAspect > canvasAspect) {
      baseScale = 1.0;
    } else {
      baseScale = displayAspect / canvasAspect;
    }

    const scale = baseScale * t.zoom;

    const aspectX = displayAspect > canvasAspect ? canvasAspect / displayAspect : 1.0;
    const aspectY = displayAspect > canvasAspect ? 1.0 : displayAspect / canvasAspect;

    const tempX = unpannedX / aspectX;
    const tempY = unpannedY / aspectY;

    const cos_r = Math.cos(t.rotation);
    const sin_r = Math.sin(t.rotation);

    const canvasNdcX = (cos_r * tempX + sin_r * tempY) / scale;
    const canvasNdcY = (-sin_r * tempX + cos_r * tempY) / scale;

    return {
      x: (canvasNdcX + 1) * 0.5 * canvasWidth,
      y: (1 - canvasNdcY) * 0.5 * canvasHeight
    };
  };

  const interpolatePoints = (start: Point2D, end: Point2D, pressure: number): StrokePoint[] => {
    const points: StrokePoint[] = [];
    const size = brushSize?.() ?? 20;
    const spacing = Math.max(1, ((brushSpacing?.() ?? 25) / 100) * size);

    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 0.001) return points;

    const dirX = dx / dist;
    const dirY = dy / dist;

    let traveled = distanceAccumulator;
    while (traveled < dist) {
      const stepNeeded = spacing - (traveled === distanceAccumulator ? distanceAccumulator : 0);
      const remaining = dist - traveled;

      if (stepNeeded > remaining) {
        distanceAccumulator = remaining + (traveled === distanceAccumulator ? distanceAccumulator : 0);
        break;
      }

      traveled += stepNeeded;

      points.push({
        x: start.x + dirX * traveled,
        y: start.y + dirY * traveled,
        pressure,
        size: 1
      });

      distanceAccumulator = 0;
    }

    return points;
  };

  const handlePointerDown = (e: PointerEvent) => {
    const canvasEl = canvas();
    const eng = engine();
    if (!canvasEl || !eng || e.button !== 0) return;

    canvasEl.setPointerCapture(e.pointerId);

    const pos = screenToCanvas(e.clientX, e.clientY, canvasEl);
    lastPoint = pos;
    distanceAccumulator = 0;

    eng.handleStrokeStart();
    eng.handleStrokePoints([
      {
        x: pos.x,
        y: pos.y,
        pressure: e.pressure || 1,
        size: 1
      }
    ]);
  };

  const handlePointerMove = (e: PointerEvent) => {
    const canvasEl = canvas();
    const eng = engine();
    if (!canvasEl || !eng || !lastPoint) return;
    if (!canvasEl.hasPointerCapture(e.pointerId)) return;

    const pos = screenToCanvas(e.clientX, e.clientY, canvasEl);
    const points = interpolatePoints(lastPoint, pos, e.pressure || 1);

    if (points.length > 0) {
      eng.handleStrokePoints(points);
    }

    lastPoint = pos;
  };

  const handlePointerUp = (e: PointerEvent) => {
    const canvasEl = canvas();
    const eng = engine();
    if (!canvasEl || !eng) return;

    if (canvasEl.hasPointerCapture(e.pointerId)) {
      canvasEl.releasePointerCapture(e.pointerId);
    }

    lastPoint = null;
    distanceAccumulator = 0;
    eng.handleStrokeEnd();
  };

  // Attach event listeners
  createEffect(
    on(canvas, (canvasEl) => {
      if (!canvasEl) return;

      canvasEl.addEventListener('pointerdown', handlePointerDown);
      canvasEl.addEventListener('pointermove', handlePointerMove);
      canvasEl.addEventListener('pointerup', handlePointerUp);
      canvasEl.addEventListener('pointercancel', handlePointerUp);

      onCleanup(() => {
        canvasEl.removeEventListener('pointerdown', handlePointerDown);
        canvasEl.removeEventListener('pointermove', handlePointerMove);
        canvasEl.removeEventListener('pointerup', handlePointerUp);
        canvasEl.removeEventListener('pointercancel', handlePointerUp);
      });
    })
  );
}

// ============================================================================
// MARK: useCanvasNavigation
// ============================================================================

export interface UseCanvasNavigationOptions {
  /** Transform accessor */
  transform: Accessor<CanvasTransform>;
  /** Transform setter */
  setTransform: (transform: CanvasTransform) => void;
  /** Canvas element */
  canvas: Accessor<HTMLCanvasElement | undefined>;
  /** Minimum zoom level */
  minZoom?: number;
  /** Maximum zoom level */
  maxZoom?: number;
  /** Callback when transform changes */
  onTransformChange?: (transform: CanvasTransform) => void;
}

/**
 * Hook to handle canvas navigation (pan, zoom, rotate).
 */
export function useCanvasNavigation(options: UseCanvasNavigationOptions) {
  const { transform, setTransform, canvas, minZoom = 0.1, maxZoom = 10, onTransformChange } = options;

  let isPanning = false;
  let lastPanPos = { x: 0, y: 0 };

  const updateTransform = (partial: Partial<CanvasTransform>) => {
    const current = transform();
    const newTransform = { ...current, ...partial };
    setTransform(newTransform);
    onTransformChange?.(newTransform);
  };

  // Wheel zoom
  const handleWheel = (e: WheelEvent) => {
    e.preventDefault();

    const current = transform();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(minZoom, Math.min(maxZoom, current.zoom * delta));

    updateTransform({ zoom: newZoom });
  };

  // Middle mouse pan
  const handleMouseDown = (e: MouseEvent) => {
    if (e.button === 1) {
      // Middle mouse
      e.preventDefault();
      isPanning = true;
      lastPanPos = { x: e.clientX, y: e.clientY };
    }
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isPanning) return;

    const dx = e.clientX - lastPanPos.x;
    const dy = e.clientY - lastPanPos.y;
    lastPanPos = { x: e.clientX, y: e.clientY };

    const current = transform();
    updateTransform({
      panX: current.panX + dx,
      panY: current.panY + dy
    });
  };

  const handleMouseUp = (e: MouseEvent) => {
    if (e.button === 1) {
      isPanning = false;
    }
  };

  // Attach event listeners
  createEffect(
    on(canvas, (canvasEl) => {
      if (!canvasEl) return;

      canvasEl.addEventListener('wheel', handleWheel, { passive: false });
      canvasEl.addEventListener('mousedown', handleMouseDown);
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);

      onCleanup(() => {
        canvasEl.removeEventListener('wheel', handleWheel);
        canvasEl.removeEventListener('mousedown', handleMouseDown);
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      });
    })
  );
}
