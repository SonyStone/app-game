export function TargetButton(props: {
  readonly clicked: boolean;
  readonly label: string;
  readonly onClick: (event: MouseEvent) => void;
  readonly onMouseDown: (event: MouseEvent) => void;
  readonly onMouseUp: (event: MouseEvent) => void;
  readonly onPointerDown: (event: PointerEvent) => void;
  readonly onPointerUp: (event: PointerEvent) => void;
  readonly ref: (element: HTMLButtonElement) => void;
}) {
  return (
    <button
      class="relative z-20 min-w-36 border border-zinc-950 px-7 py-4 text-lg font-semibold shadow-[6px_6px_0_#18181b] transition active:translate-x-1 active:translate-y-1 active:shadow-[2px_2px_0_#18181b]"
      classList={{
        'bg-amber-300 text-zinc-950': props.clicked,
        'bg-emerald-500 text-zinc-950': !props.clicked
      }}
      data-cursor-target={props.label}
      onClick={props.onClick}
      onMouseDown={props.onMouseDown}
      onMouseUp={props.onMouseUp}
      onPointerDown={props.onPointerDown}
      onPointerUp={props.onPointerUp}
      ref={props.ref}
      type="button"
    >
      {props.label}
    </button>
  );
}
