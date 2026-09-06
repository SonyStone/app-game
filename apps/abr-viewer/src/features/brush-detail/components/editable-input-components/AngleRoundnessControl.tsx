import { createMemo } from 'solid-js';

export type AngleRoundnessControlProps = {
  angle: () => number;
  setAngle: (v: number) => void;
  roundness: () => number;
  setRoundness: (v: number) => void;
  size?: number;
};

/**
 * Interactive oval control for adjusting angle and roundness (Photoshop-style).
 * - Drag the arrow tip to rotate (angle)
 * - Drag the side handles to change roundness
 */
export function AngleRoundnessControl(props: AngleRoundnessControlProps) {
  let containerRef: HTMLDivElement | undefined;

  const size = createMemo(() => props.size ?? 64);
  const center = createMemo(() => size() / 2);
  const radius = createMemo(() => (size() - 16) / 2 - 16);

  const centerAbsolute = () => {
    const bounds = containerRef?.getBoundingClientRect();
    return { x: (bounds?.left ?? 0) + (bounds?.width ?? 0) / 2, y: (bounds?.top ?? 0) + (bounds?.height ?? 0) / 2 };
  };

  // Get mouse angle relative to center (in degrees, 0 = right, counterclockwise positive)
  const getMouseAngle = (clientX: number, clientY: number) => {
    const c = centerAbsolute();
    const dx = clientX - c.x;
    const dy = clientY - c.y;
    // atan2(y, x) gives angle from positive x-axis, counterclockwise
    // We negate dy because screen Y is inverted
    return Math.atan2(-dy, dx) * (180 / Math.PI);
  };

  const getRoundnessFromMouse = (clientX: number, clientY: number) => {
    const c = centerAbsolute();
    const angleRad = (props.angle() * Math.PI) / 180;

    const dx = clientX - c.x;
    const dy = clientY - c.y;

    // Project onto the minor axis (perpendicular to arrow direction)
    // At 0°, arrow points right, so minor axis is vertical
    const minorX = Math.sin(angleRad);
    const minorY = Math.cos(angleRad);

    const dist = Math.abs(dx * minorX + dy * minorY);
    const maxDist = radius();
    const roundness = Math.round((dist / maxDist) * 100);
    return Math.max(1, Math.min(100, roundness));
  };

  let isDraggingAngle = false;
  const handleAngle = {
    pointerDown: (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      (e.target as Element).setPointerCapture(e.pointerId);
      isDraggingAngle = true;
    },
    pointerMove: (e: PointerEvent) => {
      if (isDraggingAngle) {
        let newAngle = getMouseAngle(e.clientX, e.clientY);
        props.setAngle(Math.round(newAngle));
      }
    },
    pointerUp: () => {
      isDraggingAngle = false;
    }
  };

  let isDraggingRoundness = false;
  const handleRoundness = {
    pointerDown: (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      (e.target as Element).setPointerCapture(e.pointerId);
      isDraggingRoundness = true;
    },
    pointerMove: (e: PointerEvent) => {
      if (isDraggingRoundness) {
        const newRoundness = getRoundnessFromMouse(e.clientX, e.clientY);
        props.setRoundness(newRoundness);
      }
    },
    pointerUp: () => {
      isDraggingRoundness = false;
    }
  };

  // Ellipse dimensions (before rotation): rx is horizontal, ry is vertical (roundness)
  const ellipseRx = () => radius();
  const ellipseRy = () => Math.max(1, radius() * (props.roundness() / 100));

  // Arrow tip position (before rotation) - points right from center
  const arrowLen = () => radius() + 16;
  const arrowHeadSize = 8;

  return (
    <div
      ref={containerRef}
      class="border-#777 relative border select-none"
      style={{ width: `${size()}px`, height: `${size()}px` }}
    >
      <svg width={size()} height={size()} viewBox={`0 0 ${size()} ${size()}`} class="overflow-visible">
        {/* Single group containing ellipse + arrow, rotated together */}
        <g transform={`rotate(${-props.angle()}, ${center()}, ${center()})`}>
          {/* Ellipse - horizontal major axis at 0° */}
          <ellipse
            cx={center()}
            cy={center()}
            rx={ellipseRx()}
            ry={ellipseRy()}
            fill="none"
            stroke="#77777780"
            stroke-width="1.5"
          />

          {/* Roundness handles - on minor axis (top/bottom) */}
          <RoundnessHandle
            x={center()}
            y={center() - ellipseRy()}
            onPointerDown={handleRoundness.pointerDown}
            onPointerMove={handleRoundness.pointerMove}
            onPointerUp={handleRoundness.pointerUp}
          />
          <RoundnessHandle
            x={center()}
            y={center() + ellipseRy()}
            onPointerDown={handleRoundness.pointerDown}
            onPointerMove={handleRoundness.pointerMove}
            onPointerUp={handleRoundness.pointerUp}
          />

          {/* Arrow line - points right at 0° */}
          <line x1={center()} y1={center()} x2={center() + arrowLen()} y2={center()} stroke="#777" stroke-width="1.5" />

          {/* Arrowhead - points right at 0° */}
          <Arrowhead
            x={center() + arrowLen()}
            y={center()}
            size={arrowHeadSize}
            onPointerDown={handleAngle.pointerDown}
            onPointerMove={handleAngle.pointerMove}
            onPointerUp={handleAngle.pointerUp}
          />
        </g>
      </svg>
    </div>
  );
}

function RoundnessHandle(props: {
  x: number;
  y: number;
  onPointerDown?: (e: PointerEvent) => void;
  onPointerMove?: (e: PointerEvent) => void;
  onPointerUp?: (e: PointerEvent) => void;
}) {
  return (
    <g roundness-handle transform={`translate(${props.x}, ${props.y})`}>
      <circle
        class="peer cursor-grab"
        cx={0}
        cy={0}
        r="30"
        fill="transparent"
        onPointerDown={props.onPointerDown}
        onPointerMove={props.onPointerMove}
        onPointerUp={props.onPointerUp}
      />
      <circle
        class="pointer-events-none transition-colors peer-hover:fill-white"
        cx={0}
        cy={0}
        r="3.5"
        fill="#999"
        stroke="#555"
      />
    </g>
  );
}

function Arrowhead(props: {
  x: number;
  y: number;
  size: number;
  onPointerDown?: (e: PointerEvent) => void;
  onPointerMove?: (e: PointerEvent) => void;
  onPointerUp?: (e: PointerEvent) => void;
}) {
  return (
    <g roundness-handle>
      <circle
        class="peer cursor-grab"
        cx={props.x}
        cy={props.y}
        r="30"
        fill="transparent"
        onPointerDown={props.onPointerDown}
        onPointerMove={props.onPointerMove}
        onPointerUp={props.onPointerUp}
      />
      <polygon
        points={`${props.x},${props.y} ${props.x - props.size},${props.y - props.size * 0.6} ${props.x - props.size},${props.y + props.size * 0.6}`}
        fill="#999"
        class="peer-hover:fill-white"
      />
    </g>
  );
}
