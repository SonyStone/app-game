/** Toggles the debug scroll map without changing list rendering mode. */
export function MapToggle(props: {
  /** Whether the map is currently rendered. */
  visible: boolean;
  /** Changes map visibility. */
  onChange: (visible: boolean) => void;
}) {
  return (
    <button
      type="button"
      class={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors ${
        props.visible
          ? 'border-zinc-300 bg-white text-zinc-950 shadow-sm'
          : 'border-transparent bg-zinc-100 text-zinc-500 hover:text-zinc-950'
      }`}
      aria-label={props.visible ? 'Hide scroll map' : 'Show scroll map'}
      aria-pressed={props.visible ? 'true' : 'false'}
      onClick={() => props.onChange(!props.visible)}
    >
      Map
    </button>
  );
}
