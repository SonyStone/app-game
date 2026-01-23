import { Accessor, createEffect, createSignal, on, onCleanup } from 'solid-js';
import { CanvasTransform, Point2D, StrokePoint } from '../types';

export interface PointerInputOptions {
  /** Canvas element to attach events to */
  canvas: Accessor<HTMLCanvasElement | undefined>;
  /** Current canvas transform */
  transform: Accessor<CanvasTransform>;
  /** Callback for stroke points */
  onStroke: (points: StrokePoint[]) => void;
  /** Callback when a stroke ends */
  onStrokeEnd: () => void;
  /** Current brush size */
  brushSize?: Accessor<number>;
  /** Brush spacing as percentage of brush size (1-100) */
  brushSpacing?: Accessor<number>;
  /** Drawing canvas width (default: display width) */
  canvasWidth?: number;
  /** Drawing canvas height (default: display height) */
  canvasHeight?: number;
}

/**
 * Hook to use pointer input for drawing.
 * Handles pointer events and converts them to canvas coordinates.
 */
export function usePointerInput(options: PointerInputOptions) {
  const { canvas, transform, onStroke, onStrokeEnd, brushSize, brushSpacing, canvasWidth, canvasHeight } = options;

  const [isDrawing, setIsDrawing] = createSignal(false);
  let lastPoint: Point2D | null = null;
  let lastPressure = 1;
  // Track distance traveled since last stamp
  let distanceAccumulator = 0;

  // Debug logging - set to true to enable
  const DEBUG_INTERPOLATION = true;
  let strokeId = 0;
  let segmentId = 0;
  const debugLog: string[] = [];

  const logDebug = (msg: string) => {
    if (DEBUG_INTERPOLATION) {
      debugLog.push(msg);
      // Keep only last 200 entries
      if (debugLog.length > 200) {
        debugLog.shift();
      }
    }
  };

  // Expose debug log to window for easy access
  if (DEBUG_INTERPOLATION && typeof window !== 'undefined') {
    (window as unknown as { __brushDebug: () => void; __brushDebugLog: string[] }).__brushDebugLog = debugLog;
    (window as unknown as { __brushDebug: () => void }).__brushDebug = () => {
      console.log('=== BRUSH DEBUG LOG ===');
      debugLog.forEach((line) => console.log(line));
      console.log('=== END DEBUG LOG ===');
    };
    console.log('Brush debug enabled. Call __brushDebug() in console to see log, or access __brushDebugLog array.');
  }

  /**
   * Convert screen coordinates to canvas coordinates (pixels)
   * Maps from display space to the fixed-size drawing canvas
   *
   * The display transform in the shader is:
   *   clipPos = transform * vertexPos
   * where vertexPos is in NDC (-1 to 1) and clipPos is the final screen position.
   *
   * The forward transform is: M = Translation * Aspect * Rotation * Scale
   * We need to invert this to go from screen position back to canvas pixels.
   */
  const screenToCanvas = (x: number, y: number, canvasEl: HTMLCanvasElement): Point2D => {
    const rect = canvasEl.getBoundingClientRect();
    const t = transform();

    // Drawing canvas dimensions (fixed size)
    const drawWidth = canvasWidth ?? rect.width;
    const drawHeight = canvasHeight ?? rect.height;

    // Convert screen position to NDC (-1 to 1)
    // In NDC: X goes from -1 (left) to 1 (right)
    //         Y goes from -1 (bottom) to 1 (top)
    const ndcX = ((x - rect.left) / rect.width) * 2 - 1;
    const ndcY = -(((y - rect.top) / rect.height) * 2 - 1); // Flip Y: screen Y down, NDC Y up

    // Calculate pan in NDC space (same as DisplayPass)
    const px = (t.panX / rect.width) * 2;
    const py = -(t.panY / rect.height) * 2;

    // Undo pan (inverse of translation)
    const unpannedX = ndcX - px;
    const unpannedY = ndcY - py;

    // Calculate scale factors (same as DisplayPass)
    const displayAspect = rect.width / rect.height;
    const canvasAspect = drawWidth / drawHeight;

    let baseScale: number;
    if (displayAspect > canvasAspect) {
      baseScale = 1.0;
    } else {
      baseScale = displayAspect / canvasAspect;
    }

    const scale = baseScale * t.zoom;

    const aspectX = displayAspect > canvasAspect ? canvasAspect / displayAspect : 1.0;
    const aspectY = displayAspect > canvasAspect ? 1.0 : displayAspect / canvasAspect;

    // The forward transform is: Aspect * Rotation * Scale
    // Forward: outputX = aspectX * scale * (cos*inX - sin*inY)
    //          outputY = aspectY * scale * (sin*inX + cos*inY)
    //
    // To invert:
    // 1. Undo aspect: tempX = unpannedX / aspectX, tempY = unpannedY / aspectY
    // 2. Undo rotation and scale combined
    //
    // After undoing aspect, we have:
    // tempX = scale * (cos*inX - sin*inY)
    // tempY = scale * (sin*inX + cos*inY)
    //
    // This is scale * R * input, so inverse is (1/scale) * R^T * temp

    // Undo aspect correction
    const tempX = unpannedX / aspectX;
    const tempY = unpannedY / aspectY;

    // Undo rotation and scale (inverse rotation = transpose, then divide by scale)
    const cos_r = Math.cos(t.rotation);
    const sin_r = Math.sin(t.rotation);

    // R^T = | cos  sin |
    //       |-sin  cos |
    const canvasNdcX = (cos_r * tempX + sin_r * tempY) / scale;
    const canvasNdcY = (-sin_r * tempX + cos_r * tempY) / scale;

    // Convert from canvas NDC (-1 to 1) to canvas pixels (0 to drawWidth/drawHeight)
    // NDC -1 -> pixel 0, NDC +1 -> pixel drawWidth
    return {
      x: (canvasNdcX + 1) * 0.5 * drawWidth,
      y: (1 - canvasNdcY) * 0.5 * drawHeight // Flip Y back: NDC Y up, canvas Y down
    };
  };

  /**
   * Calculate distance between two points
   */
  const distance = (a: Point2D, b: Point2D): number => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return Math.sqrt(dx * dx + dy * dy);
  };

  /**
   * Interpolate between two points and return stroke points
   * Uses distance accumulator to ensure consistent spacing
   */
  const interpolateStroke = (
    from: Point2D,
    to: Point2D,
    fromPressure: number,
    toPressure: number,
    size: number
  ): StrokePoint[] => {
    segmentId++;
    const points: StrokePoint[] = [];
    const dist = distance(from, to);

    if (dist < 0.001) {
      logDebug(`[S${strokeId}:seg${segmentId}] SKIP: dist=${dist.toFixed(4)} < 0.001`);
      return [];
    }

    // Brush spacing: percentage of brush size (1-100%)
    const spacingPercent = brushSpacing?.() ?? 5;
    const spacing = Math.max(size * (spacingPercent / 100), 1);

    const oldAccum = distanceAccumulator;
    // Add segment distance to accumulator
    distanceAccumulator += dist;

    // Direction vector (normalized)
    const dx = (to.x - from.x) / dist;
    const dy = (to.y - from.y) / dist;

    // Calculate how far along the segment we need to start
    // (accounting for leftover distance from previous segment)
    let currentDist = spacing - (distanceAccumulator - dist);

    logDebug(
      `[S${strokeId}:seg${segmentId}] from=(${from.x.toFixed(1)},${from.y.toFixed(1)}) to=(${to.x.toFixed(1)},${to.y.toFixed(1)}) dist=${dist.toFixed(2)} spacing=${spacing.toFixed(2)} oldAccum=${oldAccum.toFixed(2)} newAccum=${distanceAccumulator.toFixed(2)} startDist=${currentDist.toFixed(2)}`
    );

    // Ensure minimum distance to prevent stamps too close together
    // This handles floating point precision issues at segment boundaries
    const minSpacing = spacing * 0.1; // At least 10% of spacing between stamps
    if (currentDist < minSpacing) {
      logDebug(
        `  -> currentDist ${currentDist.toFixed(2)} < minSpacing ${minSpacing.toFixed(2)}, skipping to next interval`
      );
      currentDist = spacing; // Skip to next spacing interval
    }

    // Generate points along the segment at exact spacing intervals
    let stampCount = 0;
    while (currentDist <= dist) {
      const t = currentDist / dist;
      const ix = from.x + dx * currentDist;
      const iy = from.y + dy * currentDist;
      const pressure = fromPressure + (toPressure - fromPressure) * t;

      points.push({ x: ix, y: iy, pressure, size });
      logDebug(
        `  -> STAMP #${stampCount} at (${ix.toFixed(1)},${iy.toFixed(1)}) dist=${currentDist.toFixed(2)} pressure=${pressure.toFixed(2)}`
      );
      stampCount++;
      currentDist += spacing;
    }

    // Update accumulator: keep only the remainder
    const finalAccum = distanceAccumulator % spacing;
    logDebug(`  -> Created ${stampCount} stamps, finalAccum=${finalAccum.toFixed(2)}`);
    distanceAccumulator = finalAccum;

    return points;
  };

  /**
   * Handle pointer down - start a new stroke
   */
  const handlePointerDown = (e: PointerEvent) => {
    const canvasEl = canvas();
    if (!canvasEl) return;
    if (e.button !== 0) return; // Only left mouse button
    if (e.altKey) return; // Alt+drag is for rotation, don't draw

    // Capture pointer for smooth tracking
    canvasEl.setPointerCapture(e.pointerId);

    const point = screenToCanvas(e.clientX, e.clientY, canvasEl);
    // For mouse (pointerType = "mouse"), pressure is typically 0.5 when pressed
    // For pen/touch, use actual pressure. Clamp to valid range.
    let pressure: number;
    if (e.pointerType === 'mouse') {
      pressure = 0.5; // Constant pressure for mouse
    } else {
      // Use actual pressure for pen/touch, with fallback
      const rawPressure = e.pressure > 0 ? e.pressure : 0.5;
      pressure = Math.min(Math.max(rawPressure, 0.01), 1);
    }
    const size = brushSize?.() ?? 20;

    // New stroke
    strokeId++;
    segmentId = 0;
    logDebug(`\n=== STROKE ${strokeId} START ===`);
    logDebug(
      `pointerDown at (${point.x.toFixed(1)},${point.y.toFixed(1)}) pressure=${pressure.toFixed(2)} size=${size} pointerType=${e.pointerType}`
    );

    setIsDrawing(true);
    lastPoint = point;
    lastPressure = pressure;

    // Reset distance accumulator
    distanceAccumulator = 0;
    logDebug(`Reset distanceAccumulator to 0, creating initial stamp`);

    onStroke([
      {
        x: point.x,
        y: point.y,
        pressure,
        size
      }
    ]);
  };

  /**
   * Handle pointer move - add points to stroke
   */
  const handlePointerMove = (e: PointerEvent) => {
    if (!isDrawing()) return;
    if (e.altKey) return; // Alt+drag is for rotation, don't draw

    const canvasEl = canvas();
    if (!canvasEl) return;

    // Get coalesced events for smoother strokes (intermediate points between frames)
    const coalescedEvents = e.getCoalescedEvents?.() ?? [];

    // Process coalesced events if available, otherwise use current event
    const eventsToProcess = coalescedEvents.length > 0 ? coalescedEvents : [e];

    logDebug(`pointerMove: ${eventsToProcess.length} events to process (coalesced=${coalescedEvents.length > 0})`);

    const allPoints: StrokePoint[] = [];
    const size = brushSize?.() ?? 20;

    for (let i = 0; i < eventsToProcess.length; i++) {
      const event = eventsToProcess[i];
      // Skip if no button pressed
      if (event.buttons === 0) {
        logDebug(`  event[${i}] SKIP: buttons=0`);
        continue;
      }

      const point = screenToCanvas(event.clientX, event.clientY, canvasEl);
      // For mouse, use constant pressure. For pen/touch, use actual pressure.
      let pressure: number;
      if (event.pointerType === 'mouse') {
        pressure = 0.5;
      } else {
        const rawPressure = event.pressure > 0 ? event.pressure : 0.5;
        pressure = Math.min(Math.max(rawPressure, 0.01), 1);
      }

      logDebug(
        `  event[${i}] point=(${point.x.toFixed(1)},${point.y.toFixed(1)}) lastPoint=${lastPoint ? `(${lastPoint.x.toFixed(1)},${lastPoint.y.toFixed(1)})` : 'null'}`
      );

      if (lastPoint) {
        const interpolated = interpolateStroke(lastPoint, point, lastPressure, pressure, size);
        allPoints.push(...interpolated);
      }

      // Always update lastPoint to track position for next segment
      lastPoint = point;
      lastPressure = pressure;
    }

    logDebug(`  => Total stamps this move: ${allPoints.length}`);

    if (allPoints.length > 0) {
      onStroke(allPoints);
    }
  };

  /**
   * Handle pointer up - end the stroke
   */
  const handlePointerUp = (e: PointerEvent) => {
    const canvasEl = canvas();
    if (canvasEl) {
      canvasEl.releasePointerCapture(e.pointerId);
    }

    if (isDrawing()) {
      setIsDrawing(false);
      lastPoint = null;
      onStrokeEnd();
    }
  };

  /**
   * Handle pointer leave - end stroke if drawing
   */
  const handlePointerLeave = () => {
    if (isDrawing()) {
      setIsDrawing(false);
      lastPoint = null;
      onStrokeEnd();
    }
  };

  // Attach event listeners reactively when canvas becomes available
  createEffect(
    on(canvas, (canvasEl) => {
      if (!canvasEl) return;

      canvasEl.addEventListener('pointerdown', handlePointerDown);
      canvasEl.addEventListener('pointermove', handlePointerMove);
      canvasEl.addEventListener('pointerup', handlePointerUp);
      canvasEl.addEventListener('pointerleave', handlePointerLeave);
      canvasEl.addEventListener('pointercancel', handlePointerUp);

      onCleanup(() => {
        canvasEl.removeEventListener('pointerdown', handlePointerDown);
        canvasEl.removeEventListener('pointermove', handlePointerMove);
        canvasEl.removeEventListener('pointerup', handlePointerUp);
        canvasEl.removeEventListener('pointerleave', handlePointerLeave);
        canvasEl.removeEventListener('pointercancel', handlePointerUp);
      });
    })
  );

  return {
    isDrawing
  };
}
