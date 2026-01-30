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
}

/**
 * Hook to handle canvas transform (pan/zoom/rotate).
 * Handles:
 * - Middle mouse pan, scroll zoom, and alt+drag rotation (mouse)
 * - One finger pan, two finger pinch zoom + rotate (touch)
 */
export function useCanvasTransform(options: CanvasTransformOptions) {
  const { canvas, transform, onTransformChange } = options;

  // Mouse state
  let isPanning = false;
  let isRotating = false;
  let lastX = 0;
  let lastY = 0;

  // Touch state
  let activeTouches: TouchPoint[] = [];
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
  // MARK: Touch Gesture Handlers
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
   * Convert Touch to TouchPoint
   */
  const touchToPoint = (touch: Touch): TouchPoint => ({
    id: touch.identifier,
    x: touch.clientX,
    y: touch.clientY
  });

  /**
   * Handle touch start - begin gesture tracking
   */
  const handleTouchStart = (e: TouchEvent) => {
    // Prevent default to avoid scrolling/zooming the page
    e.preventDefault();

    // Update active touches
    activeTouches = Array.from(e.touches).map(touchToPoint);

    if (activeTouches.length === 1) {
      // One finger - prepare for pan
      lastTouchCenter = { x: activeTouches[0].x, y: activeTouches[0].y };
    } else if (activeTouches.length === 2) {
      // Two fingers - prepare for pinch zoom + rotate
      const [t1, t2] = activeTouches;
      lastTouchCenter = getTouchCenter(t1, t2);
      lastTouchDistance = getTouchDistance(t1, t2);
      lastTouchAngle = getTouchAngle(t1, t2);
    }
  };

  /**
   * Handle touch move - process gestures
   */
  const handleTouchMove = (e: TouchEvent) => {
    e.preventDefault();

    // Update active touches
    activeTouches = Array.from(e.touches).map(touchToPoint);

    if (activeTouches.length === 1 && lastTouchCenter) {
      // One finger - pan
      const touch = activeTouches[0];
      const dx = touch.x - lastTouchCenter.x;
      const dy = touch.y - lastTouchCenter.y;

      pan(dx, dy);

      lastTouchCenter = { x: touch.x, y: touch.y };
    } else if (activeTouches.length === 2 && lastTouchCenter && lastTouchDistance !== null && lastTouchAngle !== null) {
      // Two fingers - pinch zoom + rotate
      const [t1, t2] = activeTouches;
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
   * Handle touch end - reset gesture state when all fingers lifted
   */
  const handleTouchEnd = (e: TouchEvent) => {
    e.preventDefault();

    // Update active touches
    activeTouches = Array.from(e.touches).map(touchToPoint);

    if (activeTouches.length === 0) {
      // All fingers lifted - reset state
      lastTouchCenter = null;
      lastTouchDistance = null;
      lastTouchAngle = null;
    } else if (activeTouches.length === 1) {
      // Went from 2 fingers to 1 - reset to single finger pan mode
      lastTouchCenter = { x: activeTouches[0].x, y: activeTouches[0].y };
      lastTouchDistance = null;
      lastTouchAngle = null;
    } else if (activeTouches.length === 2) {
      // Still 2 fingers (maybe one lifted and another touched) - recalculate
      const [t1, t2] = activeTouches;
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

      // Touch events
      canvasEl.addEventListener('touchstart', handleTouchStart, { passive: false });
      canvasEl.addEventListener('touchmove', handleTouchMove, { passive: false });
      canvasEl.addEventListener('touchend', handleTouchEnd, { passive: false });
      canvasEl.addEventListener('touchcancel', handleTouchEnd, { passive: false });

      onCleanup(() => {
        // Mouse events
        canvasEl.removeEventListener('mousedown', handleMouseDown);
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        canvasEl.removeEventListener('wheel', handleWheel);
        canvasEl.removeEventListener('contextmenu', handleContextMenu);

        // Touch events
        canvasEl.removeEventListener('touchstart', handleTouchStart);
        canvasEl.removeEventListener('touchmove', handleTouchMove);
        canvasEl.removeEventListener('touchend', handleTouchEnd);
        canvasEl.removeEventListener('touchcancel', handleTouchEnd);
      });
    })
  );
}
