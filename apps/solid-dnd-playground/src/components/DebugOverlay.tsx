import type { Vec2 } from 'solid-dnd';
import { Show, type JSX } from 'solid-js';

// ============================================================================
// MARK: DebugOverlay
// ============================================================================

/** Full-screen SVG crosshair overlay that follows the pointer during drag. */
export function DebugOverlay(props: { position: Vec2.Vec2 | null; isDragging: boolean }): JSX.Element {
  return (
    <Show when={props.isDragging && props.position}>
      {(pos) => (
        <svg class="pointer-events-none fixed inset-0 z-9999" style={{ width: '100vw', height: '100vh' }}>
          <line
            x1={pos().x}
            y1={pos().y - 14}
            x2={pos().x}
            y2={pos().y + 14}
            stroke="#60a5fa"
            stroke-width="1"
            opacity="0.6"
          />
          <line
            x1={pos().x - 14}
            y1={pos().y}
            x2={pos().x + 14}
            y2={pos().y}
            stroke="#60a5fa"
            stroke-width="1"
            opacity="0.6"
          />
          <circle cx={pos().x} cy={pos().y} r="3" fill="#60a5fa" opacity="0.8" />
          <text x={pos().x + 12} y={pos().y - 10} fill="#60a5fa" font-size="10" font-family="monospace" opacity="0.7">
            {pos().x.toFixed(0)}, {pos().y.toFixed(0)}
          </text>
        </svg>
      )}
    </Show>
  );
}
