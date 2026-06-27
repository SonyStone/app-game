import type { JSX } from 'solid-js';

export function IconButton(props: {
  readonly children: JSX.Element;
  readonly label: string;
  readonly onClick: () => void;
}) {
  return (
    <button
      aria-label={props.label}
      class="grid h-10 w-10 place-items-center border border-zinc-300 bg-white/90 text-zinc-800 shadow-sm transition hover:border-zinc-500 hover:bg-zinc-100"
      onClick={props.onClick}
      title={props.label}
      type="button"
    >
      <svg aria-hidden="true" class="h-5 w-5" fill="none" viewBox="0 0 24 24">
        {props.children}
      </svg>
    </button>
  );
}
