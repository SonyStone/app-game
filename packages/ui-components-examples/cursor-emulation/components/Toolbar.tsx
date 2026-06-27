import { IconButton } from './IconButton';

export function Toolbar(props: { readonly onReplayClick: () => void; readonly onReplayPinch: () => void }) {
  return (
    <div class="absolute top-5 left-5 z-40 flex flex-wrap items-center gap-3">
      <div class="border border-zinc-300 bg-white/90 px-3 py-2 text-sm font-medium shadow-sm">Cursor Emulation</div>
      <IconButton label="Replay click" onClick={props.onReplayClick}>
        <path
          d="M7 11.5h10M13 7l4.5 4.5L13 16"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
        />
      </IconButton>
      <IconButton label="Pinch zoom in, then out" onClick={props.onReplayPinch}>
        <path
          d="M8 12h8M12 8v8M5 5l3 3M19 5l-3 3M5 19l3-3M19 19l-3-3"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
        />
      </IconButton>
    </div>
  );
}
