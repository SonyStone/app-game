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
import { createSignal, For, onCleanup, onMount, type Accessor, type JSX } from 'solid-js';

// ============================================================================
// Types
// ============================================================================

export type PointerDebugInfo = {
  id: number;
  x: number;
  y: number;
  pointerType: 'touch' | 'pen' | 'mouse';
  pressure?: number;
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
// Global Debug State
// ============================================================================

export const pointerDebugState = {
  pointers: new Map<number, PointerDebugInfo>(),
  twoFingerGesture: null as TwoFingerDebugInfo | null,
  canvasTransform: null as CanvasTransformDebugInfo | null,
  listeners: new Set<() => void>()
};

export function updatePointerDebug(id: number, info: PointerDebugInfo | null) {
  if (info === null) {
    pointerDebugState.pointers.delete(id);
  } else {
    pointerDebugState.pointers.set(id, info);
  }
  pointerDebugState.listeners.forEach((l) => l());
}

export function updateTwoFingerDebug(info: TwoFingerDebugInfo | null) {
  pointerDebugState.twoFingerGesture = info;
  pointerDebugState.listeners.forEach((l) => l());
}

export function updateCanvasTransformDebug(info: CanvasTransformDebugInfo | null) {
  pointerDebugState.canvasTransform = info;
  pointerDebugState.listeners.forEach((l) => l());
}

// ============================================================================
// Main Component
// ============================================================================

export function PointerDebugOverlay(props: PointerDebugOverlayProps): JSX.Element {
  const [pointers, setPointers] = createSignal<PointerDebugInfo[]>([]);
  const [twoFingerGesture, setTwoFingerGesture] = createSignal<TwoFingerDebugInfo | null>(null);
  const [canvasTransform, setCanvasTransform] = createSignal<CanvasTransformDebugInfo | null>(null);
  const [localPointers, setLocalPointers] = createSignal<Map<number, PointerDebugInfo>>(new Map());

  // Subscribe to global debug state updates
  onMount(() => {
    const update = () => {
      setPointers(Array.from(pointerDebugState.pointers.values()));
      setTwoFingerGesture(pointerDebugState.twoFingerGesture);
      setCanvasTransform(pointerDebugState.canvasTransform);
    };
    pointerDebugState.listeners.add(update);
    onCleanup(() => {
      pointerDebugState.listeners.delete(update);
    });
  });

  // Also track pointer events directly for immediate feedback
  onMount(() => {
    const container = props.container();
    if (!container) return;

    const handlePointerDown = (e: PointerEvent) => {
      if (!props.enabled()) return;
      setLocalPointers((prev) => {
        const next = new Map(prev);
        next.set(e.pointerId, {
          id: e.pointerId,
          x: e.clientX,
          y: e.clientY,
          pointerType: e.pointerType as 'touch' | 'pen' | 'mouse',
          pressure: e.pressure
        });
        return next;
      });
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!props.enabled()) return;
      setLocalPointers((prev) => {
        if (!prev.has(e.pointerId)) return prev;
        const next = new Map(prev);
        next.set(e.pointerId, {
          id: e.pointerId,
          x: e.clientX,
          y: e.clientY,
          pointerType: e.pointerType as 'touch' | 'pen' | 'mouse',
          pressure: e.pressure
        });
        return next;
      });
    };

    const handlePointerUp = (e: PointerEvent) => {
      setLocalPointers((prev) => {
        const next = new Map(prev);
        next.delete(e.pointerId);
        return next;
      });
    };

    makeEventListener(window, 'pointerdown', handlePointerDown);
    makeEventListener(window, 'pointermove', handlePointerMove);
    makeEventListener(window, 'pointerup', handlePointerUp);
    makeEventListener(window, 'pointercancel', handlePointerUp);
  });

  // Merge global and local pointers
  const allPointers = () => {
    const global = pointers();
    const local = Array.from(localPointers().values());
    const merged = new Map<number, PointerDebugInfo>();
    global.forEach((p) => merged.set(p.id, p));
    local.forEach((p) => merged.set(p.id, p));
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

function CanvasRectVisualization(props: { transform: CanvasTransformDebugInfo }): JSX.Element | null {
  const t = props.transform;
  if (!t.canvasRect || !t.canvasSize) return null;

  const rect = t.canvasRect;
  const size = t.canvasSize;

  // Match DisplayPass transform calculation exactly
  const displayWidth = rect.width;
  const displayHeight = rect.height;
  const cw = size.width;
  const ch = size.height;

  // Calculate aspect ratios (same as DisplayPass)
  const displayAspect = displayWidth / displayHeight;
  const canvasAspect = cw / ch;

  // Base scale to fit canvas in display (same logic as DisplayPass)
  let baseScale: number;
  if (displayAspect > canvasAspect) {
    baseScale = 1.0;
  } else {
    baseScale = displayAspect / canvasAspect;
  }

  const scale = baseScale * t.zoom;

  // Aspect ratio correction (same as DisplayPass)
  const aspectX = displayAspect > canvasAspect ? canvasAspect / displayAspect : 1.0;
  const aspectY = displayAspect > canvasAspect ? 1.0 : displayAspect / canvasAspect;

  // Normalized pan (same as DisplayPass)
  const px = (t.panX / displayWidth) * 2;
  const py = -(t.panY / displayHeight) * 2;

  // Canvas corners in NDC space (canvas is -1 to 1 in its own space)
  const corners = [
    { x: -1, y: 1 },
    { x: 1, y: 1 },
    { x: 1, y: -1 },
    { x: -1, y: -1 }
  ];

  const cos_r = Math.cos(t.rotation);
  const sin_r = Math.sin(t.rotation);

  // Transform corners using same matrix as DisplayPass
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

  const pathD =
    `M ${screenCorners[0].x} ${screenCorners[0].y} ` +
    `L ${screenCorners[1].x} ${screenCorners[1].y} ` +
    `L ${screenCorners[2].x} ${screenCorners[2].y} ` +
    `L ${screenCorners[3].x} ${screenCorners[3].y} Z`;

  const centerScreenX = rect.left + (px + 1) * 0.5 * displayWidth;
  const centerScreenY = rect.top + (1 - py) * 0.5 * displayHeight;

  return (
    <>
      <path d={pathD} fill="none" stroke="#ff8800" stroke-width="3" stroke-dasharray="10,5" />
      <circle cx={centerScreenX} cy={centerScreenY} r="6" fill="#ff8800" />
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
      <div class="mt-1 text-red-500">● Gesture Center</div>
      <div class="text-neutral-500">--- Start Vector</div>
      <div class="text-green-500">— Current Vector</div>
      <div class="mt-1 text-orange-500">□ Canvas Rect</div>
    </div>
  );
}

function CanvasTransformInfo(props: { transform: CanvasTransformDebugInfo }): JSX.Element {
  const t = props.transform;

  return (
    <div class="min-w-50 absolute right-2.5 top-2.5 rounded bg-black/85 p-2.5 font-mono text-xs text-white">
      <div class="mb-1.5 font-bold text-cyan-400">Canvas Transform</div>
      <div>
        <span class="text-neutral-500">panX:</span> <span class="text-yellow-400">{t.panX.toFixed(1)}</span>
      </div>
      <div>
        <span class="text-neutral-500">panY:</span> <span class="text-yellow-400">{t.panY.toFixed(1)}</span>
      </div>
      <div>
        <span class="text-neutral-500">zoom:</span> <span class="text-green-500">{t.zoom.toFixed(3)}</span>
      </div>
      <div>
        <span class="text-neutral-500">rotation:</span>{' '}
        <span class="text-fuchsia-500">{((t.rotation * 180) / Math.PI).toFixed(1)}°</span>
      </div>
      {t.canvasRect && (
        <>
          <div class="mt-1.5 text-[10px] text-neutral-500">
            Canvas: {Math.round(t.canvasRect.width)}x{Math.round(t.canvasRect.height)}
          </div>
          <div class="text-[10px] text-neutral-500">
            @ ({Math.round(t.canvasRect.left)}, {Math.round(t.canvasRect.top)})
          </div>
        </>
      )}
    </div>
  );
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
