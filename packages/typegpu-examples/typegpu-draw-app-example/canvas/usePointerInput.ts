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
  /** Force pan mode - when enabled, mouse input is treated as pan (useful on macOS with stylus + touch) */
  forcePanMode?: Accessor<boolean>;
}

/**
 * Hook to use pointer input for drawing.
 * Handles pointer events and converts them to canvas coordinates.
 */
export function usePointerInput(options: PointerInputOptions) {
  const { canvas, transform, onStroke, onStrokeEnd, brushSize, brushSpacing, canvasWidth, canvasHeight, forcePanMode } =
    options;

  const [isDrawing, setIsDrawing] = createSignal(false);
  let lastPoint: Point2D | null = null;
  let lastPressure = 1;
  // Track distance traveled since last stamp
  let distanceAccumulator = 0;

  // Point buffer for Catmull-Rom smoothing (need 4 points for spline)
  type BufferedPoint = { x: number; y: number; pressure: number };
  let pointBuffer: BufferedPoint[] = [];

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
   * Catmull-Rom spline interpolation
   * Returns a point on the spline at parameter t (0-1) between p1 and p2
   * p0 and p3 are control points that influence the curve shape
   */
  const catmullRom = (
    p0: BufferedPoint,
    p1: BufferedPoint,
    p2: BufferedPoint,
    p3: BufferedPoint,
    t: number
  ): BufferedPoint => {
    const t2 = t * t;
    const t3 = t2 * t;

    // Catmull-Rom basis functions
    const b0 = -0.5 * t3 + t2 - 0.5 * t;
    const b1 = 1.5 * t3 - 2.5 * t2 + 1.0;
    const b2 = -1.5 * t3 + 2.0 * t2 + 0.5 * t;
    const b3 = 0.5 * t3 - 0.5 * t2;

    return {
      x: b0 * p0.x + b1 * p1.x + b2 * p2.x + b3 * p3.x,
      y: b0 * p0.y + b1 * p1.y + b2 * p2.y + b3 * p3.y,
      pressure: b0 * p0.pressure + b1 * p1.pressure + b2 * p2.pressure + b3 * p3.pressure
    };
  };

  /**
   * Generate smoothed points between p1 and p2 using Catmull-Rom spline
   * Uses p0 as previous control and p3 as next control
   */
  const generateSmoothedPoints = (
    p0: BufferedPoint,
    p1: BufferedPoint,
    p2: BufferedPoint,
    p3: BufferedPoint,
    segmentLength: number
  ): BufferedPoint[] => {
    const points: BufferedPoint[] = [];

    // Estimate the curve length to determine number of samples
    const chordLength = distance(p1, p2);
    // More samples for longer segments, minimum 2 for short ones
    const numSamples = Math.max(2, Math.ceil(chordLength / segmentLength));

    for (let i = 0; i <= numSamples; i++) {
      const t = i / numSamples;
      points.push(catmullRom(p0, p1, p2, p3, t));
    }

    return points;
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
    if (e.altKey) return; // Alt+drag is for rotation, don't draw

    // Skip touch input - touch gestures are handled by useCanvasTransform
    // (one finger = pan, two fingers = zoom/rotate)
    if (e.pointerType === 'touch') return;

    // In force pan mode, ignore all mouse buttons (left, right, middle)
    // This is useful on macOS where touch input is interpreted as mouse
    if (forcePanMode?.() && e.pointerType === 'mouse') return;

    // Only left mouse button for drawing (after force pan mode check)
    if (e.button !== 0) return;

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

    // Reset distance accumulator and point buffer
    distanceAccumulator = 0;
    pointBuffer = [{ x: point.x, y: point.y, pressure }];
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
   * Uses Catmull-Rom spline smoothing for smoother curves
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

    // Collect all new points from events
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

      // Add point to buffer for smoothing
      pointBuffer.push({ x: point.x, y: point.y, pressure });

      logDebug(`  event[${i}] point=(${point.x.toFixed(1)},${point.y.toFixed(1)}) buffer size=${pointBuffer.length}`);
    }

    // We need at least 4 points for Catmull-Rom interpolation
    // Process smoothed segments when we have enough points
    while (pointBuffer.length >= 4) {
      const p0 = pointBuffer[0];
      const p1 = pointBuffer[1];
      const p2 = pointBuffer[2];
      const p3 = pointBuffer[3];

      // Generate smoothed points between p1 and p2
      // Use a segment length that's proportional to brush size for good detail
      const segmentLength = Math.max(2, size * 0.1);
      const smoothedPoints = generateSmoothedPoints(p0, p1, p2, p3, segmentLength);

      logDebug(`  Smoothing: ${smoothedPoints.length} points between buffer[1] and buffer[2]`);

      // Interpolate stroke through smoothed points
      for (const smoothedPoint of smoothedPoints) {
        if (lastPoint) {
          const interpolated = interpolateStroke(lastPoint, smoothedPoint, lastPressure, smoothedPoint.pressure, size);
          allPoints.push(...interpolated);
        }
        lastPoint = { x: smoothedPoint.x, y: smoothedPoint.y };
        lastPressure = smoothedPoint.pressure;
      }

      // Remove the processed point (keep overlap for next segment)
      pointBuffer.shift();
    }

    logDebug(`  => Total stamps this move: ${allPoints.length}`);

    if (allPoints.length > 0) {
      onStroke(allPoints);
    }
  };

  /**
   * Handle pointer up - end the stroke
   * Flushes remaining points in the smoothing buffer
   */
  const handlePointerUp = (e: PointerEvent) => {
    const canvasEl = canvas();
    if (canvasEl) {
      canvasEl.releasePointerCapture(e.pointerId);
    }

    if (isDrawing()) {
      // Flush remaining points in buffer (less than 4 points)
      // For the tail, we use linear interpolation since we can't do full Catmull-Rom
      if (pointBuffer.length >= 2) {
        const size = brushSize?.() ?? 20;
        const allPoints: StrokePoint[] = [];

        logDebug(`  Flushing ${pointBuffer.length} remaining buffer points`);

        for (let i = 1; i < pointBuffer.length; i++) {
          const to = pointBuffer[i];

          if (lastPoint) {
            const interpolated = interpolateStroke(lastPoint, to, lastPressure, to.pressure, size);
            allPoints.push(...interpolated);
          }
          lastPoint = { x: to.x, y: to.y };
          lastPressure = to.pressure;
        }

        if (allPoints.length > 0) {
          onStroke(allPoints);
        }
      }

      setIsDrawing(false);
      lastPoint = null;
      pointBuffer = [];
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
      pointBuffer = [];
      onStrokeEnd();
    }
  };

  /**
   * Prevent context menu in force pan mode
   */
  const handleContextMenu = (e: MouseEvent) => {
    if (forcePanMode?.()) {
      e.preventDefault();
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
      canvasEl.addEventListener('contextmenu', handleContextMenu);

      onCleanup(() => {
        canvasEl.removeEventListener('pointerdown', handlePointerDown);
        canvasEl.removeEventListener('pointermove', handlePointerMove);
        canvasEl.removeEventListener('pointerup', handlePointerUp);
        canvasEl.removeEventListener('pointerleave', handlePointerLeave);
        canvasEl.removeEventListener('pointercancel', handlePointerUp);
        canvasEl.removeEventListener('contextmenu', handleContextMenu);
      });
    })
  );

  return {
    isDrawing
  };
}
