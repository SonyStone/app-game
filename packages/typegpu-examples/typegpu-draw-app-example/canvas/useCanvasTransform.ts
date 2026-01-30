import { Accessor, createEffect, on, onCleanup } from 'solid-js';
import { CanvasTransform } from '../types';

export interface CanvasTransformOptions {
  /** Canvas element to attach events to */
  canvas: Accessor<HTMLCanvasElement | undefined>;
  /** Current transform state accessor */
  transform: Accessor<CanvasTransform>;
  /** Callback when transform changes */
  onTransformChange: (transform: CanvasTransform) => void;
}

/** Track active touch points */
interface TouchPoint {
  id: number;
  x: number;
  y: number;
  pointerType: string;
}

/**
 * Hook to handle canvas transform (pan/zoom/rotate).
 * Handles:
 * - Middle mouse pan, scroll zoom, and alt+drag rotation (mouse)
 * - One finger pan, two finger pinch zoom + rotate (touch only, not pen/stylus)
 */
export function useCanvasTransform(options: CanvasTransformOptions) {
  const { canvas, transform, onTransformChange } = options;

  // Mouse state
  let isPanning = false;
  let isRotating = false;
  let lastX = 0;
  let lastY = 0;

  // Touch state (using pointer events for touch-only gestures)
  const activePointers: Map<number, TouchPoint> = new Map();
  let lastTouchCenter: { x: number; y: number } | null = null;
  let lastTouchDistance: number | null = null;
  let lastTouchAngle: number | null = null;

  /**
   * Update pan offset
   */
  const pan = (dx: number, dy: number) => {
    const t = transform();
    onTransformChange({
      ...t,
      panX: t.panX + dx,
      panY: t.panY + dy
    });
  };

  /**
   * Update zoom level, zooming toward a specific point (in screen coordinates)
   * @param delta - Zoom delta (positive = zoom in, negative = zoom out)
   * @param centerX - X coordinate to zoom toward (relative to canvas)
   * @param centerY - Y coordinate to zoom toward (relative to canvas)
   */
  const zoomToPoint = (delta: number, centerX: number, centerY: number) => {
    const t = transform();
    const canvasEl = canvas();
    if (!canvasEl) return;

    const rect = canvasEl.getBoundingClientRect();

    // Get the position relative to canvas center
    const relX = centerX - rect.width / 2;
    const relY = centerY - rect.height / 2;

    // Calculate new zoom
    const newZoom = Math.max(0.1, Math.min(10, t.zoom * (1 + delta)));
    const zoomRatio = newZoom / t.zoom;

    // Adjust pan to keep the point under cursor fixed
    // The point at (relX, relY) from center should stay at the same screen position
    // Before zoom: screenPos = panX + relX
    // After zoom: screenPos = newPanX + relX * zoomRatio
    // So: newPanX = panX + relX - relX * zoomRatio = panX + relX * (1 - zoomRatio)
    const newPanX = t.panX + (relX - t.panX) * (1 - zoomRatio);
    const newPanY = t.panY + (relY - t.panY) * (1 - zoomRatio);

    onTransformChange({
      ...t,
      zoom: newZoom,
      panX: newPanX,
      panY: newPanY
    });
  };

  /**
   * Update rotation around screen center
   * Adjusts pan so the canvas rotates around the screen center, not canvas center
   */
  const rotate = (deltaAngle: number) => {
    const t = transform();
    const canvasEl = canvas();
    if (!canvasEl) return;

    const rect = canvasEl.getBoundingClientRect();

    // Pan is stored in screen pixels where Y points down
    // For rotation to work correctly without wobble, we must rotate
    // the pan vector in a coordinate system with equal units for X and Y
    //
    // Use the same reference for both axes (e.g., height) to ensure
    // isotropic coordinates. This prevents the wobble caused by
    // different normalization factors for X and Y.

    // Use height as the reference (or could use width, just needs to be consistent)
    const refSize = rect.height;

    // Convert pan to isotropic coordinates (same scale for X and Y)
    // Flip Y because screen Y points down but we want standard math coords
    const isoPanX = t.panX / refSize;
    const isoPanY = -t.panY / refSize;

    // Rotate in isotropic space
    const cos_r = Math.cos(deltaAngle);
    const sin_r = Math.sin(deltaAngle);
    const rotatedPanX = isoPanX * cos_r - isoPanY * sin_r;
    const rotatedPanY = isoPanX * sin_r + isoPanY * cos_r;

    // Convert back to pixel space (flip Y back)
    const newPanX = rotatedPanX * refSize;
    const newPanY = -rotatedPanY * refSize;

    onTransformChange({
      ...t,
      panX: newPanX,
      panY: newPanY,
      rotation: t.rotation + deltaAngle
    });
  };

  /**
   * Handle mouse down for pan/rotate
   */
  const handleMouseDown = (e: MouseEvent) => {
    // Middle mouse button for pan
    if (e.button === 1) {
      e.preventDefault();
      isPanning = true;
      lastX = e.clientX;
      lastY = e.clientY;
    }
    // Alt + left click for rotate
    else if (e.button === 0 && e.altKey) {
      e.preventDefault();
      isRotating = true;
      lastX = e.clientX;
      lastY = e.clientY;
    }
  };

  /**
   * Handle mouse move for pan/rotate
   */
  const handleMouseMove = (e: MouseEvent) => {
    if (!isPanning && !isRotating) return;

    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;

    if (isPanning) {
      pan(dx, dy);
    } else if (isRotating) {
      // Rotate based on horizontal movement
      rotate(dx * 0.01);
    }

    lastX = e.clientX;
    lastY = e.clientY;
  };

  /**
   * Handle mouse up
   */
  const handleMouseUp = () => {
    isPanning = false;
    isRotating = false;
  };

  /**
   * Handle wheel for zoom toward pointer position
   */
  const handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    const canvasEl = canvas();
    if (!canvasEl) return;

    const rect = canvasEl.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const delta = -e.deltaY * 0.001;
    zoomToPoint(delta, mouseX, mouseY);
  };

  /**
   * Prevent context menu on middle click
   */
  const handleContextMenu = (e: MouseEvent) => {
    if (e.button === 1) {
      e.preventDefault();
    }
  };

  // ============================================================================
  // MARK: Touch Gesture Handlers (using Pointer Events)
  // ============================================================================

  /**
   * Get center point between two touch points
   */
  const getTouchCenter = (t1: TouchPoint, t2: TouchPoint): { x: number; y: number } => ({
    x: (t1.x + t2.x) / 2,
    y: (t1.y + t2.y) / 2
  });

  /**
   * Get distance between two touch points
   */
  const getTouchDistance = (t1: TouchPoint, t2: TouchPoint): number => {
    const dx = t2.x - t1.x;
    const dy = t2.y - t1.y;
    return Math.sqrt(dx * dx + dy * dy);
  };

  /**
   * Get angle between two touch points (in radians)
   */
  const getTouchAngle = (t1: TouchPoint, t2: TouchPoint): number => {
    return Math.atan2(t2.y - t1.y, t2.x - t1.x);
  };

  /**
   * Get active touch pointers as array (excludes pen/mouse)
   */
  const getTouchPointers = (): TouchPoint[] => {
    return Array.from(activePointers.values()).filter((p) => p.pointerType === 'touch');
  };

  /**
   * Handle pointer down for touch gestures
   */
  const handleTouchPointerDown = (e: PointerEvent) => {
    // Only handle touch input (not pen or mouse)
    if (e.pointerType !== 'touch') return;

    // Prevent default to avoid scrolling/zooming the page
    e.preventDefault();

    const canvasEl = canvas();
    if (canvasEl) {
      // Capture this pointer for reliable tracking
      canvasEl.setPointerCapture(e.pointerId);
    }

    // Add to active pointers
    activePointers.set(e.pointerId, {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      pointerType: e.pointerType
    });

    const touches = getTouchPointers();

    if (touches.length === 1) {
      // One finger - prepare for pan
      lastTouchCenter = { x: touches[0].x, y: touches[0].y };
    } else if (touches.length === 2) {
      // Two fingers - prepare for pinch zoom + rotate
      const [t1, t2] = touches;
      lastTouchCenter = getTouchCenter(t1, t2);
      lastTouchDistance = getTouchDistance(t1, t2);
      lastTouchAngle = getTouchAngle(t1, t2);
    }
  };

  /**
   * Handle pointer move for touch gestures
   */
  const handleTouchPointerMove = (e: PointerEvent) => {
    // Only handle touch input
    if (e.pointerType !== 'touch') return;
    if (!activePointers.has(e.pointerId)) return;

    e.preventDefault();

    // Update this pointer's position
    activePointers.set(e.pointerId, {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      pointerType: e.pointerType
    });

    const touches = getTouchPointers();

    if (touches.length === 1 && lastTouchCenter) {
      // One finger - pan
      const touch = touches[0];
      const dx = touch.x - lastTouchCenter.x;
      const dy = touch.y - lastTouchCenter.y;

      pan(dx, dy);

      lastTouchCenter = { x: touch.x, y: touch.y };
    } else if (touches.length === 2 && lastTouchCenter && lastTouchDistance !== null && lastTouchAngle !== null) {
      // Two fingers - pinch zoom + rotate
      const [t1, t2] = touches;
      const currentCenter = getTouchCenter(t1, t2);
      const currentDistance = getTouchDistance(t1, t2);
      const currentAngle = getTouchAngle(t1, t2);

      const canvasEl = canvas();
      if (!canvasEl) return;

      const rect = canvasEl.getBoundingClientRect();

      // Calculate pan from center movement
      const dx = currentCenter.x - lastTouchCenter.x;
      const dy = currentCenter.y - lastTouchCenter.y;

      // Calculate zoom from distance change
      const zoomDelta = (currentDistance - lastTouchDistance) / lastTouchDistance;

      // Calculate rotation from angle change
      let angleDelta = currentAngle - lastTouchAngle;
      // Normalize angle delta to avoid jumps when crossing ±π
      if (angleDelta > Math.PI) angleDelta -= 2 * Math.PI;
      if (angleDelta < -Math.PI) angleDelta += 2 * Math.PI;

      // Apply pan
      pan(dx, dy);

      // Apply zoom toward the pinch center
      const centerX = currentCenter.x - rect.left;
      const centerY = currentCenter.y - rect.top;
      zoomToPoint(zoomDelta, centerX, centerY);

      // Apply rotation
      rotate(angleDelta);

      // Update last values
      lastTouchCenter = currentCenter;
      lastTouchDistance = currentDistance;
      lastTouchAngle = currentAngle;
    }
  };

  /**
   * Handle pointer up/cancel for touch gestures
   */
  const handleTouchPointerUp = (e: PointerEvent) => {
    // Only handle touch input
    if (e.pointerType !== 'touch') return;

    const canvasEl = canvas();
    if (canvasEl && canvasEl.hasPointerCapture(e.pointerId)) {
      canvasEl.releasePointerCapture(e.pointerId);
    }

    // Remove from active pointers
    activePointers.delete(e.pointerId);

    const touches = getTouchPointers();

    if (touches.length === 0) {
      // All fingers lifted - reset state
      lastTouchCenter = null;
      lastTouchDistance = null;
      lastTouchAngle = null;
    } else if (touches.length === 1) {
      // Went from 2 fingers to 1 - reset to single finger pan mode
      lastTouchCenter = { x: touches[0].x, y: touches[0].y };
      lastTouchDistance = null;
      lastTouchAngle = null;
    } else if (touches.length === 2) {
      // Still 2 fingers (maybe one lifted and another touched) - recalculate
      const [t1, t2] = touches;
      lastTouchCenter = getTouchCenter(t1, t2);
      lastTouchDistance = getTouchDistance(t1, t2);
      lastTouchAngle = getTouchAngle(t1, t2);
    }
  };

  // Attach event listeners reactively when canvas becomes available
  createEffect(
    on(canvas, (canvasEl) => {
      if (!canvasEl) return;

      // Mouse events
      canvasEl.addEventListener('mousedown', handleMouseDown);
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      canvasEl.addEventListener('wheel', handleWheel, { passive: false });
      canvasEl.addEventListener('contextmenu', handleContextMenu);

      // Touch gestures via pointer events (allows distinguishing touch from pen)
      canvasEl.addEventListener('pointerdown', handleTouchPointerDown);
      canvasEl.addEventListener('pointermove', handleTouchPointerMove);
      canvasEl.addEventListener('pointerup', handleTouchPointerUp);
      canvasEl.addEventListener('pointercancel', handleTouchPointerUp);

      // Prevent default touch actions to avoid browser gestures interfering
      canvasEl.style.touchAction = 'none';

      onCleanup(() => {
        // Mouse events
        canvasEl.removeEventListener('mousedown', handleMouseDown);
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        canvasEl.removeEventListener('wheel', handleWheel);
        canvasEl.removeEventListener('contextmenu', handleContextMenu);

        // Touch gestures via pointer events
        canvasEl.removeEventListener('pointerdown', handleTouchPointerDown);
        canvasEl.removeEventListener('pointermove', handleTouchPointerMove);
        canvasEl.removeEventListener('pointerup', handleTouchPointerUp);
        canvasEl.removeEventListener('pointercancel', handleTouchPointerUp);
      });
    })
  );
}
