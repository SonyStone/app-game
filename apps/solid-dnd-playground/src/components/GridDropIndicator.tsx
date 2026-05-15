import type { JSX } from 'solid-js';

// ============================================================================
// MARK: GridDropIndicator
// ============================================================================

/** Vertical bar indicator with dots at top and bottom, positioned absolutely within a grid container. */
export function GridDropIndicator(props: { x: number; y: number; height: number }): JSX.Element {
  return (
    <div
      class="pointer-events-none absolute z-10"
      style={{
        left: `${props.x}px`,
        top: `${props.y}px`,
        width: '3px',
        height: `${props.height}px`,
        transform: 'translateX(-1.5px)'
      }}
    >
      <div class="h-full w-full rounded-full bg-blue-400 shadow-sm shadow-blue-400/50" />
      {/* Top dot */}
      <div class="absolute -top-1 -left-1 h-2.5 w-2.5 rounded-full border-2 border-blue-400 bg-neutral-900" />
      {/* Bottom dot */}
      <div class="absolute -bottom-1 -left-1 h-2.5 w-2.5 rounded-full border-2 border-blue-400 bg-neutral-900" />
    </div>
  );
}
