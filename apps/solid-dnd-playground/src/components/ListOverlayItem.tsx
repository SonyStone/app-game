import { For, Show, type JSX } from 'solid-js';
import type { DemoItem } from '../data';
import { GripIcon } from './icons';

/** Floating overlay showing the dragged list item(s) with a stacking effect. */
export function ListOverlayItem(props: { items: DemoItem[]; draggedIds: ReadonlyArray<string> }): JSX.Element {
  const draggedItems = () => props.items.filter((i) => props.draggedIds.includes(i.id));

  return (
    <div class="flex flex-col gap-1">
      <For each={draggedItems()}>
        {(item, i) => (
          <div
            class="flex items-center gap-3 rounded-lg border border-blue-500/50 bg-neutral-800 px-4 py-3 shadow-xl shadow-blue-500/10"
            style={{
              opacity: i() === 0 ? 1 : Math.max(0.3, 1 - i() * 0.2),
              transform: i() > 0 ? `translate(${i() * 4}px, ${i() * 2}px)` : undefined
            }}
          >
            <GripIcon class="h-4 w-4 text-blue-400" />
            <div class="h-3 w-3 shrink-0 rounded-full" style={{ background: item.color }} />
            <span class="text-sm text-neutral-200">{item.label}</span>
            <span class="ml-auto font-mono text-xs text-neutral-500">{item.id}</span>
          </div>
        )}
      </For>
      <Show when={props.draggedIds.length > 1}>
        <div class="mt-1 text-center text-xs text-blue-400/70">{props.draggedIds.length} items</div>
      </Show>
    </div>
  );
}
