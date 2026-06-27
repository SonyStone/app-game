import { For } from 'solid-js';

export function TransformPanel(props: {
  readonly label: string;
  readonly onPointerCancel: (event: PointerEvent) => void;
  readonly onPointerDown: (event: PointerEvent) => void;
  readonly onPointerMove: (event: PointerEvent) => void;
  readonly onPointerUp: (event: PointerEvent) => void;
  readonly ref: (element: HTMLDivElement) => void;
  readonly scale: number;
  readonly tone: 'cyan' | 'rose';
}) {
  return (
    <div
      class="relative z-20 grid h-48 w-[min(20rem,calc(100vw-3rem))] touch-none place-items-center overflow-hidden border border-zinc-950 bg-white shadow-[6px_6px_0_#18181b]"
      data-cursor-target={props.label}
      onPointerCancel={props.onPointerCancel}
      onPointerDown={props.onPointerDown}
      onPointerMove={props.onPointerMove}
      onPointerUp={props.onPointerUp}
      ref={props.ref}
    >
      <div class="pointer-events-none absolute inset-0 grid grid-cols-6 grid-rows-4 opacity-35">
        <For each={Array.from({ length: 24 })}>
          {(_, index) => (
            <span
              class="border-r border-b border-zinc-300"
              classList={{
                'bg-cyan-100': props.tone === 'cyan' && index() % 5 === 0,
                'bg-rose-100': props.tone === 'rose' && index() % 5 === 0
              }}
            />
          )}
        </For>
      </div>
      <div
        class="pointer-events-none grid h-24 w-24 place-items-center border border-zinc-950 font-semibold transition-transform duration-75"
        classList={{
          'bg-cyan-300': props.tone === 'cyan',
          'bg-rose-300': props.tone === 'rose'
        }}
        style={{ transform: `scale(${props.scale})` }}
      >
        {props.scale.toFixed(2)}
      </div>
      <div class="pointer-events-none absolute bottom-3 left-3 bg-white/85 px-2 py-1 text-sm font-medium">
        {props.label}
      </div>
    </div>
  );
}
