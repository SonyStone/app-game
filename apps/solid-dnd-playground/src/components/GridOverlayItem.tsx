import { GapKey } from 'solid-dnd';
import { Show, type JSX } from 'solid-js';
import type { DemoItem } from '../data';

/** Floating overlay showing the primary dragged grid item with a "+N more" badge. */
export function GridOverlayItem(props: { items: DemoItem[]; draggedIds: readonly (string | GapKey)[] }): JSX.Element {
  const primary = () => props.items.find((i) => props.draggedIds.includes(i.id));

  return (
    <Show when={primary()}>
      {(item) => (
        <div class="flex h-full flex-col items-center gap-2 rounded-lg border border-blue-500/50 bg-neutral-800 p-4 shadow-xl shadow-blue-500/10">
          <div class="h-8 w-8 rounded" style={{ background: item().color }} />
          <span class="text-xs text-neutral-200">{item().label}</span>
          <Show when={props.draggedIds.length > 1}>
            <span class="text-[10px] text-blue-400/70">+{props.draggedIds.length - 1} more</span>
          </Show>
        </div>
      )}
    </Show>
  );
}
