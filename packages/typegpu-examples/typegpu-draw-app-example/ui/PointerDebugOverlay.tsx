/**
 * PointerDebugOverlay - Debug visualization for pointer/touch events
 *
 * Shows:
 * - Touch points with their IDs
 * - Pen/stylus position
 * - Two-finger gesture visualization (center, start/end vectors)
 * - Rotation angle display
 */

import { createSignal, For, onCleanup, onMount, type Accessor, type JSX } from 'solid-js';

export interface PointerDebugInfo {
  id: number;
  x: number;
  y: number;
  pointerType: 'touch' | 'pen' | 'mouse';
  pressure?: number;
}

export interface TwoFingerDebugInfo {
  finger1Start: { x: number; y: number };
  finger2Start: { x: number; y: number };
  finger1Current: { x: number; y: number };
  finger2Current: { x: number; y: number };
  center: { x: number; y: number };
  angleDelta: number;
}

export interface CanvasTransformDebugInfo {
  panX: number;
  panY: number;
  zoom: number;
  rotation: number;
  // Canvas element bounds (the HTML element)
  canvasRect?: { left: number; top: number; width: number; height: number };
  // Virtual canvas size (the drawing surface, e.g. 4000x4000)
  canvasSize?: { width: number; height: number };
  // Current rotation pivot point (in screen coordinates)
  rotationPivot?: { x: number; y: number };
}

export interface PointerDebugOverlayProps {
  /** Whether debug overlay is enabled */
  enabled: Accessor<boolean>;
  /** Container element to attach events to */
  container: Accessor<HTMLElement | undefined>;
}

// Global debug state that can be updated from useCanvasTransform
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

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    onCleanup(() => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    });
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

  const getPointerColor = (type: string) => {
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
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        'pointer-events': 'none',
        'z-index': 10000,
        display: props.enabled() ? 'block' : 'none'
      }}
    >
      {/* SVG overlay for drawing debug graphics */}
      <svg
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%'
        }}
      >
        {/* Transformed canvas rectangle visualization */}
        {canvasTransform()?.canvasRect &&
          canvasTransform()?.canvasSize &&
          (() => {
            const t = canvasTransform()!;
            const rect = t.canvasRect!;
            const size = t.canvasSize!;

            // Screen center (center of the HTML canvas element)
            const screenCenterX = rect.left + rect.width / 2;
            const screenCenterY = rect.top + rect.height / 2;

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
              // Display is wider - fit by height
              baseScale = 1.0;
            } else {
              // Display is taller - fit by width
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
              { x: -1, y: 1 }, // top-left (NDC: y up)
              { x: 1, y: 1 }, // top-right
              { x: 1, y: -1 }, // bottom-right
              { x: -1, y: -1 } // bottom-left
            ];

            const cos_r = Math.cos(t.rotation);
            const sin_r = Math.sin(t.rotation);

            // Transform corners using same matrix as DisplayPass:
            // M = Translation * Aspect * Rotation * Scale
            const screenCorners = corners.map((c) => {
              // Apply Rotation * Scale
              const rx = scale * (c.x * cos_r - c.y * sin_r);
              const ry = scale * (c.x * sin_r + c.y * cos_r);
              // Apply Aspect
              const ax = aspectX * rx;
              const ay = aspectY * ry;
              // Apply Translation (in NDC)
              const ndcX = ax + px;
              const ndcY = ay + py;
              // Convert NDC to screen pixels
              // NDC (-1,1) maps to (0, width) for X
              // NDC (1,-1) maps to (0, height) for Y (flip Y)
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

            // Calculate center in screen space
            const centerNdcX = px;
            const centerNdcY = py;
            const centerScreenX = rect.left + (centerNdcX + 1) * 0.5 * displayWidth;
            const centerScreenY = rect.top + (1 - centerNdcY) * 0.5 * displayHeight;

            return (
              <>
                <path d={pathD} fill="none" stroke="#ff8800" stroke-width="3" stroke-dasharray="10,5" />
                {/* Center point of the virtual canvas */}
                <circle cx={centerScreenX} cy={centerScreenY} r="6" fill="#ff8800" />
              </>
            );
          })()}

        {/* Rotation pivot point visualization */}
        {canvasTransform()?.rotationPivot && (
          <>
            {/* Crosshair at rotation pivot */}
            <circle
              cx={canvasTransform()!.rotationPivot!.x}
              cy={canvasTransform()!.rotationPivot!.y}
              r="12"
              fill="none"
              stroke="#00ffff"
              stroke-width="3"
            />
            <line
              x1={canvasTransform()!.rotationPivot!.x - 20}
              y1={canvasTransform()!.rotationPivot!.y}
              x2={canvasTransform()!.rotationPivot!.x + 20}
              y2={canvasTransform()!.rotationPivot!.y}
              stroke="#00ffff"
              stroke-width="2"
            />
            <line
              x1={canvasTransform()!.rotationPivot!.x}
              y1={canvasTransform()!.rotationPivot!.y - 20}
              x2={canvasTransform()!.rotationPivot!.x}
              y2={canvasTransform()!.rotationPivot!.y + 20}
              stroke="#00ffff"
              stroke-width="2"
            />
          </>
        )}

        {/* Two-finger gesture visualization */}
        {twoFingerGesture() && (
          <>
            {/* Start vector (dashed line) */}
            <line
              x1={twoFingerGesture()!.finger1Start.x}
              y1={twoFingerGesture()!.finger1Start.y}
              x2={twoFingerGesture()!.finger2Start.x}
              y2={twoFingerGesture()!.finger2Start.y}
              stroke="#888888"
              stroke-width="2"
              stroke-dasharray="5,5"
            />
            {/* Current vector (solid line) */}
            <line
              x1={twoFingerGesture()!.finger1Current.x}
              y1={twoFingerGesture()!.finger1Current.y}
              x2={twoFingerGesture()!.finger2Current.x}
              y2={twoFingerGesture()!.finger2Current.y}
              stroke="#00ff00"
              stroke-width="3"
            />
            {/* Center point */}
            <circle cx={twoFingerGesture()!.center.x} cy={twoFingerGesture()!.center.y} r="8" fill="#ff0000" />
            {/* Start finger positions */}
            <circle
              cx={twoFingerGesture()!.finger1Start.x}
              cy={twoFingerGesture()!.finger1Start.y}
              r="12"
              fill="none"
              stroke="#888888"
              stroke-width="2"
            />
            <circle
              cx={twoFingerGesture()!.finger2Start.x}
              cy={twoFingerGesture()!.finger2Start.y}
              r="12"
              fill="none"
              stroke="#888888"
              stroke-width="2"
            />
          </>
        )}

        {/* Pointer circles */}
        <For each={allPointers()}>
          {(pointer) => (
            <g>
              {/* Main circle */}
              <circle
                cx={pointer.x}
                cy={pointer.y}
                r={pointer.pointerType === 'pen' ? 8 : 20}
                fill={getPointerColor(pointer.pointerType)}
                fill-opacity="0.3"
                stroke={getPointerColor(pointer.pointerType)}
                stroke-width="2"
              />
              {/* Crosshair */}
              <line
                x1={pointer.x - 15}
                y1={pointer.y}
                x2={pointer.x + 15}
                y2={pointer.y}
                stroke={getPointerColor(pointer.pointerType)}
                stroke-width="1"
              />
              <line
                x1={pointer.x}
                y1={pointer.y - 15}
                x2={pointer.x}
                y2={pointer.y + 15}
                stroke={getPointerColor(pointer.pointerType)}
                stroke-width="1"
              />
            </g>
          )}
        </For>
      </svg>

      {/* Text labels for pointers */}
      <For each={allPointers()}>
        {(pointer) => (
          <div
            style={{
              position: 'absolute',
              left: `${pointer.x + 25}px`,
              top: `${pointer.y - 10}px`,
              color: getPointerColor(pointer.pointerType),
              'font-family': 'monospace',
              'font-size': '12px',
              'text-shadow': '1px 1px 2px black',
              'white-space': 'nowrap'
            }}
          >
            {pointer.pointerType}[{pointer.id}]{pointer.pressure !== undefined && ` p=${pointer.pressure.toFixed(2)}`}
            <br />({Math.round(pointer.x)}, {Math.round(pointer.y)})
          </div>
        )}
      </For>

      {/* Two-finger gesture info */}
      {twoFingerGesture() && (
        <div
          style={{
            position: 'absolute',
            left: `${twoFingerGesture()!.center.x + 15}px`,
            top: `${twoFingerGesture()!.center.y + 15}px`,
            color: '#ff0000',
            'font-family': 'monospace',
            'font-size': '14px',
            'font-weight': 'bold',
            'text-shadow': '1px 1px 2px black',
            'white-space': 'nowrap',
            background: 'rgba(0,0,0,0.7)',
            padding: '4px 8px',
            'border-radius': '4px'
          }}
        >
          Angle: {((twoFingerGesture()!.angleDelta * 180) / Math.PI).toFixed(1)}°
        </div>
      )}

      {/* Legend */}
      <div
        style={{
          position: 'absolute',
          bottom: '10px',
          left: '10px',
          color: '#ffffff',
          'font-family': 'monospace',
          'font-size': '12px',
          background: 'rgba(0,0,0,0.7)',
          padding: '8px',
          'border-radius': '4px'
        }}
      >
        <div style={{ color: '#00ff00' }}>● Touch</div>
        <div style={{ color: '#ff00ff' }}>● Pen/Stylus</div>
        <div style={{ color: '#ffff00' }}>● Mouse</div>
        <div style={{ color: '#ff0000', 'margin-top': '4px' }}>● Gesture Center</div>
        <div style={{ color: '#888888' }}>--- Start Vector</div>
        <div style={{ color: '#00ff00' }}>— Current Vector</div>
        <div style={{ color: '#ff8800', 'margin-top': '4px' }}>□ Canvas Rect</div>
      </div>

      {/* Canvas Transform Info */}
      {canvasTransform() && (
        <div
          style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            color: '#ffffff',
            'font-family': 'monospace',
            'font-size': '12px',
            background: 'rgba(0,0,0,0.85)',
            padding: '10px',
            'border-radius': '4px',
            'min-width': '200px'
          }}
        >
          <div style={{ color: '#00ffff', 'font-weight': 'bold', 'margin-bottom': '6px' }}>Canvas Transform</div>
          <div>
            <span style={{ color: '#888' }}>panX:</span>{' '}
            <span style={{ color: '#ffff00' }}>{canvasTransform()!.panX.toFixed(1)}</span>
          </div>
          <div>
            <span style={{ color: '#888' }}>panY:</span>{' '}
            <span style={{ color: '#ffff00' }}>{canvasTransform()!.panY.toFixed(1)}</span>
          </div>
          <div>
            <span style={{ color: '#888' }}>zoom:</span>{' '}
            <span style={{ color: '#00ff00' }}>{canvasTransform()!.zoom.toFixed(3)}</span>
          </div>
          <div>
            <span style={{ color: '#888' }}>rotation:</span>{' '}
            <span style={{ color: '#ff00ff' }}>{((canvasTransform()!.rotation * 180) / Math.PI).toFixed(1)}°</span>
          </div>
          {canvasTransform()!.canvasRect && (
            <>
              <div style={{ 'margin-top': '6px', color: '#888', 'font-size': '10px' }}>
                Canvas: {Math.round(canvasTransform()!.canvasRect!.width)}x
                {Math.round(canvasTransform()!.canvasRect!.height)}
              </div>
              <div style={{ color: '#888', 'font-size': '10px' }}>
                @ ({Math.round(canvasTransform()!.canvasRect!.left)}, {Math.round(canvasTransform()!.canvasRect!.top)})
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
