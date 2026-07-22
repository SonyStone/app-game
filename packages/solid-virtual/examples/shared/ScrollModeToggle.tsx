/** Rendering modes available in each comparison example. */
export type ScrollMode = 'virtual' | 'regular';

/** Switches an example between virtualized and fully rendered scrolling. */
export function ScrollModeToggle(props: { class?: string; mode: ScrollMode; onChange: (mode: ScrollMode) => void }) {
  return (
    <div class={`flex rounded-md bg-zinc-100 p-0.5 ${props.class ?? ''}`} role="group" aria-label="Scroll mode">
      <ModeButton active={props.mode === 'virtual'} onClick={() => props.onChange('virtual')}>
        Virtual scroll
      </ModeButton>
      <ModeButton active={props.mode === 'regular'} onClick={() => props.onChange('regular')}>
        Regular scroll
      </ModeButton>
    </div>
  );
}

function ModeButton(props: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      class={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
        props.active ? 'bg-white text-zinc-950 shadow-sm' : 'text-zinc-500 hover:text-zinc-950'
      }`}
      aria-pressed={props.active}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}
