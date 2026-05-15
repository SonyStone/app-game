import { Show, type JSX } from 'solid-js';
import { NODES } from '../data';
import { GripIcon } from './icons';

// ============================================================================
// MARK: NestedOverlayItem
// ============================================================================

/** Floating overlay showing the dragged nested item (group or leaf). */
export function NestedOverlayItem(props: { draggedId: string | null }): JSX.Element {
  const node = () => (props.draggedId ? NODES[props.draggedId] : undefined);

  return (
    <Show when={node()}>
      {(n) => (
        <div
          class={`flex items-center gap-3 rounded-lg border border-blue-500/50 bg-neutral-800 shadow-xl shadow-blue-500/10 ${n().isGroup ? 'px-3 py-2' : 'px-3 py-2.5'}`}
        >
          <GripIcon class="h-3.5 w-3.5 text-blue-400" />
          <div class="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: n().color }} />
          <span class={`text-sm text-neutral-200 ${n().isGroup ? 'text-xs font-semibold' : ''}`}>{n().label}</span>
          <span class="ml-auto font-mono text-xs text-neutral-500">{n().id}</span>
        </div>
      )}
    </Show>
  );
}
