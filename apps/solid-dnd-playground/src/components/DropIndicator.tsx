import type { JSX } from 'solid-js';

export function DropIndicator(props: { y: number }): JSX.Element {
  return (
    <div
      class="pointer-events-none absolute right-3 left-3 z-10"
      style={{ top: `${props.y}px`, transform: 'translateY(-1px)' }}
    >
      <div class="h-0.5 rounded-full bg-blue-400 shadow-sm shadow-blue-400/50" />
      <div class="absolute -top-1 -left-1.5 h-2.5 w-2.5 rounded-full border-2 border-blue-400 bg-neutral-900" />
      <div class="absolute -top-1 -right-1.5 h-2.5 w-2.5 rounded-full border-2 border-blue-400 bg-neutral-900" />
    </div>
  );
}
