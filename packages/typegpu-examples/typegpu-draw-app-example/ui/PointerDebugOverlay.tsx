/**
 * PointerDebugOverlay - Debug visualization for pointer/touch events
 *
 * Shows:
 * - Touch points with their IDs
 * - Pen/stylus position
 * - Two-finger gesture visualization (center, start/end vectors)
 * - Rotation angle display
 */

import { makeEventListener } from '@solid-primitives/event-listener';
import { ReactiveMap } from '@solid-primitives/map';
import { createSignal, For, onMount, type Accessor, type JSX } from 'solid-js';
import { createStore, reconcile } from 'solid-js/store';

// ============================================================================
// Types
// ============================================================================

export type PointerDebugInfo = {
  id: number;
  x: number;
  y: number;
  pointerType: 'touch' | 'pen' | 'mouse';
  pressure?: number;
  /** Coalesced events for pen - intermediate points between frames */
  coalescedPoints?: Array<{ x: number; y: number; pressure: number }>;
};

export type StrokeDebugInfo = {
  id: number;
  pointerType: 'touch' | 'pen' | 'mouse';
  /** All points accumulated during the stroke */
  points: Array<{ x: number; y: number; pressure: number; isCoalesced: boolean }>;
};

export type TwoFingerDebugInfo = {
  finger1Start: { x: number; y: number };
  finger2Start: { x: number; y: number };
  finger1Current: { x: number; y: number };
  finger2Current: { x: number; y: number };
  center: { x: number; y: number };
  angleDelta: number;
};

export type CanvasTransformDebugInfo = {
  panX: number;
  panY: number;
  zoom: number;
  rotation: number;
  /** Canvas element bounds (the HTML element) */
  canvasRect?: { left: number; top: number; width: number; height: number };
  /** Virtual canvas size (the drawing surface, e.g. 4000x4000) */
  canvasSize?: { width: number; height: number };
  /** Current rotation pivot point (in screen coordinates) */
  rotationPivot?: { x: number; y: number };
};

export type PointerDebugOverlayProps = {
  /** Whether debug overlay is enabled */
  enabled: Accessor<boolean>;
  /** Container element to attach events to */
  container: Accessor<HTMLElement | undefined>;
};

// ============================================================================
// Global Debug State (Reactive)
// ============================================================================

type PointerDebugState = {
  twoFingerGesture: TwoFingerDebugInfo | null;
  canvasTransform: CanvasTransformDebugInfo | null;
};

const pointerDebugPointers = new ReactiveMap<number, PointerDebugInfo>();
const [pointerDebugStore, setPointerDebugStore] = createStore<PointerDebugState>({
  twoFingerGesture: null,
  canvasTransform: null
});

export const pointerDebugState = {
  pointers: pointerDebugPointers,
  get twoFingerGesture() {
    return pointerDebugStore.twoFingerGesture;
  },
  get canvasTransform() {
    return pointerDebugStore.canvasTransform;
  }
};

export function updatePointerDebug(id: number, info: PointerDebugInfo | null) {
  if (info === null) {
    pointerDebugPointers.delete(id);
  } else {
    pointerDebugPointers.set(id, info);
  }
}

export function updateTwoFingerDebug(info: TwoFingerDebugInfo | null) {
  setPointerDebugStore('twoFingerGesture', reconcile(info));
}

export function updateCanvasTransformDebug(info: CanvasTransformDebugInfo | null) {
  setPointerDebugStore('canvasTransform', reconcile(info));
}

// ============================================================================
// Main Component
// ============================================================================

export function PointerDebugOverlay(props: PointerDebugOverlayProps): JSX.Element {
  // Local state for pointer events tracked directly by this component
  const localPointers = new ReactiveMap<number, PointerDebugInfo>();
  const activeStrokes = new ReactiveMap<number, StrokeDebugInfo>();
  const [lastStroke, setLastStroke] = createSignal<StrokeDebugInfo | null>(null);

  // Access global reactive state directly (no need for manual subscription)
  const canvasTransform = () => pointerDebugStore.canvasTransform;
  const twoFingerGesture = () => pointerDebugStore.twoFingerGesture;

  // Also track pointer events directly for immediate feedback
  onMount(() => {
    const handlePointerDown = (e: PointerEvent) => {
      if (!props.enabled()) return;

      // Only track strokes for primary button (left click / pen tip / single touch)
      // Don't track for multi-touch gestures (panning/rotating)
      const isPrimaryButton = e.button === 0 && e.isPrimary;

      if (isPrimaryButton && e.pointerType !== 'touch') {
        // Clear previous stroke when starting a new one (only for pen/mouse)
        setLastStroke(null);

        // Convert screen coords to canvas NDC for storage
        const transform = canvasTransform();
        const canvasPoint = transform ? screenToCanvasNDC(e.clientX, e.clientY, transform) : null;

        // Start a new stroke (store in canvas NDC space)
        activeStrokes.set(e.pointerId, {
          id: e.pointerId,
          pointerType: e.pointerType as 'touch' | 'pen' | 'mouse',
          points: canvasPoint
            ? [{ x: canvasPoint.x, y: canvasPoint.y, pressure: e.pressure, isCoalesced: false }]
            : [{ x: e.clientX, y: e.clientY, pressure: e.pressure, isCoalesced: false }]
        });
      }

      localPointers.set(e.pointerId, {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        pointerType: e.pointerType as 'touch' | 'pen' | 'mouse',
        pressure: e.pressure
      });
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!props.enabled()) return;

      // Get coalesced events for pen and mouse input (intermediate points)
      let coalescedPoints: Array<{ x: number; y: number; pressure: number }> | undefined;
      if ((e.pointerType === 'pen' || e.pointerType === 'mouse') && e.getCoalescedEvents) {
        const coalesced = e.getCoalescedEvents();
        if (coalesced.length > 0) {
          coalescedPoints = coalesced.map((ce) => ({
            x: ce.clientX,
            y: ce.clientY,
            pressure: ce.pressure
          }));
        }
      }

      // Add points to active stroke (only if there's an active stroke for this pointer)
      const stroke = activeStrokes.get(e.pointerId);
      if (stroke && (e.buttons & 1) !== 0) {
        const transform = canvasTransform();
        const newPoints = [...stroke.points];

        // Add coalesced points (intermediate) - convert to canvas NDC
        if (coalescedPoints) {
          for (const cp of coalescedPoints) {
            const canvasPoint = transform ? screenToCanvasNDC(cp.x, cp.y, transform) : null;
            if (canvasPoint) {
              newPoints.push({ x: canvasPoint.x, y: canvasPoint.y, pressure: cp.pressure, isCoalesced: true });
            } else {
              newPoints.push({ x: cp.x, y: cp.y, pressure: cp.pressure, isCoalesced: true });
            }
          }
        }

        // Add main event point - convert to canvas NDC
        const mainCanvasPoint = transform ? screenToCanvasNDC(e.clientX, e.clientY, transform) : null;
        if (mainCanvasPoint) {
          newPoints.push({ x: mainCanvasPoint.x, y: mainCanvasPoint.y, pressure: e.pressure, isCoalesced: false });
        } else {
          newPoints.push({ x: e.clientX, y: e.clientY, pressure: e.pressure, isCoalesced: false });
        }

        activeStrokes.set(e.pointerId, { ...stroke, points: newPoints });
      }

      // Always track pointer position (not just when pressed)
      localPointers.set(e.pointerId, {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        pointerType: e.pointerType as 'touch' | 'pen' | 'mouse',
        pressure: e.pressure,
        coalescedPoints
      });
    };

    const handlePointerUp = (e: PointerEvent) => {
      // Save the completed stroke as lastStroke for visualization
      const stroke = activeStrokes.get(e.pointerId);
      if (stroke) {
        setLastStroke(stroke);
      }
      activeStrokes.delete(e.pointerId);

      // Only remove touch pointers on up, keep mouse/pen visible
      if (e.pointerType === 'touch') {
        localPointers.delete(e.pointerId);
      }
    };

    const handlePointerLeave = (e: PointerEvent) => {
      // Remove pointer when it leaves the window
      localPointers.delete(e.pointerId);
    };

    makeEventListener(window, 'pointerdown', handlePointerDown);
    makeEventListener(window, 'pointermove', handlePointerMove);
    makeEventListener(window, 'pointerup', handlePointerUp);
    makeEventListener(window, 'pointercancel', handlePointerUp);
    makeEventListener(document, 'pointerleave', handlePointerLeave);
  });

  // Merge global and local pointers
  const allPointers = () => {
    const merged = new Map<number, PointerDebugInfo>();
    // Global pointers from ReactiveMap
    for (const [id, p] of pointerDebugPointers) {
      merged.set(id, p);
    }
    // Local pointers override global
    for (const [id, p] of localPointers) {
      merged.set(id, p);
    }
    return Array.from(merged.values());
  };

  return (
    <div
      class="pointer-events-none fixed left-0 top-0 z-[10000] h-full w-full"
      style={{ display: props.enabled() ? 'block' : 'none' }}
    >
      {/* SVG overlay for drawing debug graphics */}
      <svg class="absolute left-0 top-0 h-full w-full">
        {/* Transformed canvas rectangle visualization */}
        {canvasTransform()?.canvasRect && canvasTransform()?.canvasSize && (
          <CanvasRectVisualization transform={canvasTransform()!} />
        )}

        {/* Rotation pivot point visualization */}
        {canvasTransform()?.rotationPivot && <RotationPivotVisualization pivot={canvasTransform()!.rotationPivot!} />}

        {/* Two-finger gesture visualization */}
        {twoFingerGesture() && <TwoFingerGestureVisualization gesture={twoFingerGesture()!} />}

        {/* Pointer circles */}
        <For each={allPointers()}>{(pointer) => <PointerCircle pointer={pointer} />}</For>

        {/* Coalesced points for pen and mouse (shown as trail) */}
        <For
          each={allPointers().filter(
            (p) => (p.pointerType === 'pen' || p.pointerType === 'mouse') && p.coalescedPoints
          )}
        >
          {(pointer) => <CoalescedPointsTrail points={pointer.coalescedPoints!} pointerType={pointer.pointerType} />}
        </For>

        {/* Active strokes - show all accumulated points */}
        <For each={[...activeStrokes.values()]}>
          {(stroke) => <StrokeVisualization stroke={stroke} transform={canvasTransform()} />}
        </For>

        {/* Last completed stroke */}
        {lastStroke() && <StrokeVisualization stroke={lastStroke()!} transform={canvasTransform()} isLast />}
      </svg>

      {/* Text labels for pointers */}
      <For each={allPointers()}>{(pointer) => <PointerLabel pointer={pointer} />}</For>

      {/* Two-finger gesture info */}
      {twoFingerGesture() && <TwoFingerGestureInfo gesture={twoFingerGesture()!} />}

      {/* Legend */}
      <DebugLegend />

      {/* Canvas Transform Info */}
      {canvasTransform() && <CanvasTransformInfo transform={canvasTransform()!} />}
    </div>
  );
}

// ============================================================================
// Sub-Components
// ============================================================================

function CanvasRectVisualization(props: { transform: CanvasTransformDebugInfo }): JSX.Element {
  const pathD = () => {
    const t = props.transform;
    if (!t.canvasRect || !t.canvasSize) return null;

    const rect = t.canvasRect;
    const size = t.canvasSize;

    const displayWidth = rect.width;
    const displayHeight = rect.height;
    const cw = size.width;
    const ch = size.height;

    const displayAspect = displayWidth / displayHeight;
    const canvasAspect = cw / ch;

    let baseScale: number;
    if (displayAspect > canvasAspect) {
      baseScale = 1.0;
    } else {
      baseScale = displayAspect / canvasAspect;
    }

    const scale = baseScale * t.zoom;

    const aspectX = displayAspect > canvasAspect ? canvasAspect / displayAspect : 1.0;
    const aspectY = displayAspect > canvasAspect ? 1.0 : displayAspect / canvasAspect;

    const px = (t.panX / displayWidth) * 2;
    const py = -(t.panY / displayHeight) * 2;

    const corners = [
      { x: -1, y: 1 },
      { x: 1, y: 1 },
      { x: 1, y: -1 },
      { x: -1, y: -1 }
    ];

    const cos_r = Math.cos(t.rotation);
    const sin_r = Math.sin(t.rotation);

    const screenCorners = corners.map((c) => {
      const rx = scale * (c.x * cos_r - c.y * sin_r);
      const ry = scale * (c.x * sin_r + c.y * cos_r);
      const ax = aspectX * rx;
      const ay = aspectY * ry;
      const ndcX = ax + px;
      const ndcY = ay + py;
      return {
        x: rect.left + (ndcX + 1) * 0.5 * displayWidth,
        y: rect.top + (1 - ndcY) * 0.5 * displayHeight
      };
    });

    return (
      `M ${screenCorners[0].x} ${screenCorners[0].y} ` +
      `L ${screenCorners[1].x} ${screenCorners[1].y} ` +
      `L ${screenCorners[2].x} ${screenCorners[2].y} ` +
      `L ${screenCorners[3].x} ${screenCorners[3].y} Z`
    );
  };

  const centerScreen = () => {
    const t = props.transform;
    if (!t.canvasRect) return null;
    const rect = t.canvasRect;
    const px = (t.panX / rect.width) * 2;
    const py = -(t.panY / rect.height) * 2;
    return {
      x: rect.left + (px + 1) * 0.5 * rect.width,
      y: rect.top + (1 - py) * 0.5 * rect.height
    };
  };

  return (
    <>
      {pathD() && <path d={pathD()!} fill="none" stroke="#ff8800" stroke-width="3" stroke-dasharray="10,5" />}
      {centerScreen() && <circle cx={centerScreen()!.x} cy={centerScreen()!.y} r="6" fill="#ff8800" />}
    </>
  );
}

function RotationPivotVisualization(props: { pivot: { x: number; y: number } }): JSX.Element {
  return (
    <>
      <circle cx={props.pivot.x} cy={props.pivot.y} r="12" fill="none" stroke="#00ffff" stroke-width="3" />
      <line
        x1={props.pivot.x - 20}
        y1={props.pivot.y}
        x2={props.pivot.x + 20}
        y2={props.pivot.y}
        stroke="#00ffff"
        stroke-width="2"
      />
      <line
        x1={props.pivot.x}
        y1={props.pivot.y - 20}
        x2={props.pivot.x}
        y2={props.pivot.y + 20}
        stroke="#00ffff"
        stroke-width="2"
      />
    </>
  );
}

function TwoFingerGestureVisualization(props: { gesture: TwoFingerDebugInfo }): JSX.Element {
  const g = props.gesture;
  return (
    <>
      <line
        x1={g.finger1Start.x}
        y1={g.finger1Start.y}
        x2={g.finger2Start.x}
        y2={g.finger2Start.y}
        stroke="#888888"
        stroke-width="2"
        stroke-dasharray="5,5"
      />
      <line
        x1={g.finger1Current.x}
        y1={g.finger1Current.y}
        x2={g.finger2Current.x}
        y2={g.finger2Current.y}
        stroke="#00ff00"
        stroke-width="3"
      />
      <circle cx={g.center.x} cy={g.center.y} r="8" fill="#ff0000" />
      <circle cx={g.finger1Start.x} cy={g.finger1Start.y} r="12" fill="none" stroke="#888888" stroke-width="2" />
      <circle cx={g.finger2Start.x} cy={g.finger2Start.y} r="12" fill="none" stroke="#888888" stroke-width="2" />
    </>
  );
}

function PointerCircle(props: { pointer: PointerDebugInfo }): JSX.Element {
  const color = getPointerColor(props.pointer.pointerType);
  const radius = props.pointer.pointerType === 'pen' ? 8 : 20;

  return (
    <g>
      <circle
        cx={props.pointer.x}
        cy={props.pointer.y}
        r={radius}
        fill={color}
        fill-opacity="0.3"
        stroke={color}
        stroke-width="2"
      />
      <line
        x1={props.pointer.x - 15}
        y1={props.pointer.y}
        x2={props.pointer.x + 15}
        y2={props.pointer.y}
        stroke={color}
        stroke-width="1"
      />
      <line
        x1={props.pointer.x}
        y1={props.pointer.y - 15}
        x2={props.pointer.x}
        y2={props.pointer.y + 15}
        stroke={color}
        stroke-width="1"
      />
    </g>
  );
}

function CoalescedPointsTrail(props: {
  points: Array<{ x: number; y: number; pressure: number }>;
  pointerType: 'touch' | 'pen' | 'mouse';
}): JSX.Element {
  const points = props.points;
  if (points.length === 0) return <></>;

  const color = getPointerColor(props.pointerType);

  // Create path from coalesced points
  const pathD =
    points.length > 1
      ? `M ${points[0].x} ${points[0].y} ` +
        points
          .slice(1)
          .map((p) => `L ${p.x} ${p.y}`)
          .join(' ')
      : '';

  return (
    <g>
      {/* Trail line connecting coalesced points */}
      {pathD && <path d={pathD} fill="none" stroke={color} stroke-width="2" stroke-opacity="0.5" />}

      {/* Individual coalesced points */}
      <For each={points}>
        {(point, index) => (
          <g>
            {/* Small circle for each coalesced point */}
            <circle
              cx={point.x}
              cy={point.y}
              r={3 + point.pressure * 3}
              fill={color}
              fill-opacity={0.3 + point.pressure * 0.4}
              stroke={color}
              stroke-width="1"
            />
            {/* Index label */}
            <text x={point.x + 6} y={point.y - 6} fill={color} font-size="8" font-family="monospace">
              {index()}
            </text>
          </g>
        )}
      </For>
    </g>
  );
}

function StrokeVisualization(props: {
  stroke: StrokeDebugInfo;
  transform: CanvasTransformDebugInfo | null;
  isLast?: boolean;
}): JSX.Element {
  const points = props.stroke.points;
  if (points.length === 0) return <></>;
  const color = getPointerColor(props.stroke.pointerType);
  const opacity = props.isLast ? 0.5 : 1.0;

  // Get SVG transform to convert canvas NDC to screen coordinates
  const svgTransform = () => (props.transform ? getCanvasToScreenTransform(props.transform) : null);

  // Create path from stroke points (in canvas NDC coordinates)
  const pathD = () =>
    points.length > 1
      ? `M ${points[0].x} ${points[0].y} ` +
        points
          .slice(1)
          .map((p) => `L ${p.x} ${p.y}`)
          .join(' ')
      : '';

  // Scale factor for stroke width and circle radius (to compensate for transform scale)
  const strokeScale = () => {
    if (!props.transform?.canvasRect) return 1;
    const rect = props.transform.canvasRect;
    const displayAspect = rect.width / rect.height;
    const canvasAspect = props.transform.canvasSize
      ? props.transform.canvasSize.width / props.transform.canvasSize.height
      : 1;
    const baseScale = displayAspect > canvasAspect ? 1.0 : displayAspect / canvasAspect;
    const scale = baseScale * props.transform.zoom;
    const pixelScale = (rect.width / 2) * scale;
    return 1 / pixelScale;
  };

  return (
    <g opacity={opacity} transform={svgTransform() ?? undefined}>
      {/* Trail line connecting all stroke points */}
      {pathD() && <path d={pathD()} fill="none" stroke={color} stroke-width={2 * strokeScale()} stroke-opacity="0.7" />}

      {/* Individual stroke points */}
      <For each={points}>
        {(point) => (
          <circle
            cx={point.x}
            cy={point.y}
            r={(point.isCoalesced ? 2 + point.pressure * 2 : 3 + point.pressure * 2) * strokeScale()}
            fill={point.isCoalesced ? 'cyan' : color}
            fill-opacity={point.isCoalesced ? 0.8 : 0.9}
            stroke={point.isCoalesced ? '#006666' : 'black'}
            stroke-width={(point.isCoalesced ? 1 : 1.5) * strokeScale()}
          />
        )}
      </For>
    </g>
  );
}

function PointerLabel(props: { pointer: PointerDebugInfo }): JSX.Element {
  const color = getPointerColor(props.pointer.pointerType);

  return (
    <div
      class="absolute whitespace-nowrap font-mono text-xs"
      style={{
        left: `${props.pointer.x + 25}px`,
        top: `${props.pointer.y - 10}px`,
        color,
        'text-shadow': '1px 1px 2px black'
      }}
    >
      {props.pointer.pointerType}[{props.pointer.id}]
      {props.pointer.pressure !== undefined && ` p=${props.pointer.pressure.toFixed(2)}`}
      <br />({Math.round(props.pointer.x)}, {Math.round(props.pointer.y)})
    </div>
  );
}

function TwoFingerGestureInfo(props: { gesture: TwoFingerDebugInfo }): JSX.Element {
  return (
    <div
      class="absolute whitespace-nowrap rounded bg-black/70 px-2 py-1 font-mono text-sm font-bold text-red-500"
      style={{
        left: `${props.gesture.center.x + 15}px`,
        top: `${props.gesture.center.y + 15}px`,
        'text-shadow': '1px 1px 2px black'
      }}
    >
      Angle: {((props.gesture.angleDelta * 180) / Math.PI).toFixed(1)}°
    </div>
  );
}

function DebugLegend(): JSX.Element {
  return (
    <div class="absolute bottom-2.5 left-2.5 rounded bg-black/70 p-2 font-mono text-xs text-white">
      <div class="text-green-500">● Touch</div>
      <div class="text-fuchsia-500">● Pen/Stylus</div>
      <div class="text-yellow-400">● Mouse</div>
      <div class="mt-1 text-cyan-400">● Coalesced Points</div>
      <div class="mt-1 text-red-500">● Gesture Center</div>
      <div class="text-neutral-500">--- Start Vector</div>
      <div class="text-green-500">— Current Vector</div>
      <div class="mt-1 text-orange-500">□ Canvas Rect</div>
    </div>
  );
}

function CanvasTransformInfo(props: { transform: CanvasTransformDebugInfo }): JSX.Element {
  return (
    <div class="min-w-50 absolute right-2.5 top-2.5 rounded bg-black/85 p-2.5 font-mono text-xs text-white">
      <div class="mb-1.5 font-bold text-cyan-400">Canvas Transform</div>
      <div>
        <span class="text-neutral-500">panX:</span>{' '}
        <span class="text-yellow-400">{props.transform.panX.toFixed(1)}</span>
      </div>
      <div>
        <span class="text-neutral-500">panY:</span>{' '}
        <span class="text-yellow-400">{props.transform.panY.toFixed(1)}</span>
      </div>
      <div>
        <span class="text-neutral-500">zoom:</span>{' '}
        <span class="text-green-500">{props.transform.zoom.toFixed(3)}</span>
      </div>
      <div>
        <span class="text-neutral-500">rotation:</span>{' '}
        <span class="text-fuchsia-500">{((props.transform.rotation * 180) / Math.PI).toFixed(1)}°</span>
      </div>
      {props.transform.canvasRect && (
        <>
          <div class="mt-1.5 text-[10px] text-neutral-500">
            Canvas: {Math.round(props.transform.canvasRect.width)}x{Math.round(props.transform.canvasRect.height)}
          </div>
          <div class="text-[10px] text-neutral-500">
            @ ({Math.round(props.transform.canvasRect.left)}, {Math.round(props.transform.canvasRect.top)})
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// Coordinate Conversion Helpers
// ============================================================================

/** Convert screen coordinates to canvas NDC space (-1 to 1) */
function screenToCanvasNDC(
  screenX: number,
  screenY: number,
  t: CanvasTransformDebugInfo
): { x: number; y: number } | null {
  if (!t.canvasRect || !t.canvasSize) return null;

  const rect = t.canvasRect;
  const displayWidth = rect.width;
  const displayHeight = rect.height;
  const displayAspect = displayWidth / displayHeight;
  const canvasAspect = t.canvasSize.width / t.canvasSize.height;

  // Base scale
  const baseScale = displayAspect > canvasAspect ? 1.0 : displayAspect / canvasAspect;
  const scale = baseScale * t.zoom;

  // Aspect correction
  const aspectX = displayAspect > canvasAspect ? canvasAspect / displayAspect : 1.0;
  const aspectY = displayAspect > canvasAspect ? 1.0 : displayAspect / canvasAspect;

  // Normalized pan
  const px = (t.panX / displayWidth) * 2;
  const py = -(t.panY / displayHeight) * 2;

  // Convert screen to NDC
  const ndcX = ((screenX - rect.left) / displayWidth) * 2 - 1;
  const ndcY = 1 - ((screenY - rect.top) / displayHeight) * 2;

  // Remove pan
  const unpannedX = ndcX - px;
  const unpannedY = ndcY - py;

  // Remove aspect correction
  const unaspectX = unpannedX / aspectX;
  const unaspectY = unpannedY / aspectY;

  // Remove scale and rotation (inverse rotation)
  const cos_r = Math.cos(-t.rotation);
  const sin_r = Math.sin(-t.rotation);
  const unscaledX = unaspectX / scale;
  const unscaledY = unaspectY / scale;
  const canvasX = unscaledX * cos_r - unscaledY * sin_r;
  const canvasY = unscaledX * sin_r + unscaledY * cos_r;

  return { x: canvasX, y: canvasY };
}

/** Get SVG transform string to convert canvas NDC (-1 to 1) to screen coordinates */
function getCanvasToScreenTransform(t: CanvasTransformDebugInfo): string | null {
  if (!t.canvasRect || !t.canvasSize) return null;

  const rect = t.canvasRect;
  const displayWidth = rect.width;
  const displayHeight = rect.height;
  const displayAspect = displayWidth / displayHeight;
  const canvasAspect = t.canvasSize.width / t.canvasSize.height;

  // Base scale
  const baseScale = displayAspect > canvasAspect ? 1.0 : displayAspect / canvasAspect;
  const scale = baseScale * t.zoom;

  // Aspect correction
  const aspectX = displayAspect > canvasAspect ? canvasAspect / displayAspect : 1.0;
  const aspectY = displayAspect > canvasAspect ? 1.0 : displayAspect / canvasAspect;

  // Pan in NDC
  const px = (t.panX / displayWidth) * 2;
  const py = -(t.panY / displayHeight) * 2;

  // Center of screen in pixels
  const centerX = rect.left + displayWidth / 2;
  const centerY = rect.top + displayHeight / 2;

  // Scale from NDC to screen pixels
  const scaleToScreenX = displayWidth / 2;
  const scaleToScreenY = -displayHeight / 2; // Flip Y axis

  // Build transform: translate to center, apply pan, scale, aspect, rotation, then NDC scale
  // SVG transforms are applied right-to-left, so we build the string in reverse order
  const cos_r = Math.cos(t.rotation);
  const sin_r = Math.sin(t.rotation);

  // Combined transform matrix:
  // 1. Scale canvas NDC by (scale)
  // 2. Rotate by rotation
  // 3. Apply aspect correction
  // 4. Add pan (in NDC)
  // 5. Convert from NDC to screen pixels

  // Final matrix coefficients (combining all transforms)
  const a = scaleToScreenX * aspectX * scale * cos_r;
  const b = scaleToScreenY * aspectY * scale * sin_r;
  const c = scaleToScreenX * aspectX * scale * -sin_r;
  const d = scaleToScreenY * aspectY * scale * cos_r;
  const e = centerX + scaleToScreenX * px;
  const f = centerY + scaleToScreenY * py;

  return `matrix(${a}, ${b}, ${c}, ${d}, ${e}, ${f})`;
}

// ============================================================================
// Helper Functions
// ============================================================================

function getPointerColor(type: string): string {
  switch (type) {
    case 'touch':
      return '#00ff00';
    case 'pen':
      return '#ff00ff';
    case 'mouse':
      return '#ffff00';
    default:
      return '#ffffff';
  }
}
