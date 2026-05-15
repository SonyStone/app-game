import { For, Show, type JSX } from 'solid-js';
import type { DemoItem } from '../data';
import { GripIcon } from './icons';

// ============================================================================
// MARK: SortableOverlayItem
// ============================================================================

/**
 * Unified drag-overlay content that adapts via `@container` queries.
 *
 * - **Narrow** (< 320 px / `@xs`): card layout showing the primary item
 *   with a "+N more" badge — ideal for grid overlays.
 * - **Wide** (≥ 320 px / `@xs`): stacked row layout showing all dragged
 *   items with offset/opacity — ideal for list overlays.
 *
 * The overlay's explicit `width` (set by the drag controller from the
 * source element's bounding box) drives the container query automatically.
 */
export function SortableOverlayItem(props: { readonly draggedItems: ReadonlyArray<DemoItem> }): JSX.Element {
  const extraCount = () => props.draggedItems.length - 1;

  return (
    <div class="@container flex h-full flex-col gap-1">
      <For each={props.draggedItems}>
        {(draggedItem, i) => (
          <div
            class={`flex h-full flex-col items-center gap-2 rounded-lg border border-blue-500/50 bg-neutral-800 p-4 shadow-xl shadow-blue-500/10 @xs:flex-row @xs:gap-3 @xs:px-4 @xs:py-3 ${
              i() === 0 ? '' : 'hidden @xs:flex'
            }`}
            style={{
              opacity: i() === 0 ? 1 : Math.max(0.3, 1 - i() * 0.2),
              transform: i() > 0 ? `translate(${i() * 4}px, ${i() * 2}px)` : undefined
            }}
          >
            {/* Grip icon — row mode only */}
            <div class="hidden shrink-0 @xs:block">
              <GripIcon class="h-4 w-4 text-blue-400" />
            </div>

            {/* Color swatch */}
            <div
              class="h-8 w-8 shrink-0 rounded @xs:h-3 @xs:w-3 @xs:rounded-full"
              style={{ background: draggedItem.color }}
            />

            {/* Label */}
            <span class="text-xs text-neutral-200 @xs:text-sm">{draggedItem.label}</span>
            {/* ID — row mode only */}
            <span class="hidden font-mono text-xs text-neutral-500 @xs:ml-auto @xs:inline">{draggedItem.id}</span>
          </div>
        )}
      </For>

      <Show when={extraCount() > 0}>
        {/* Card mode: "+N more" */}
        <span class="text-center text-[10px] text-blue-400/70 @xs:hidden">+{extraCount()} more</span>
        {/* Row mode: "N items" */}
        <div class="mt-1 hidden text-center text-xs text-blue-400/70 @xs:block">{props.draggedItems.length} items</div>
      </Show>
    </div>
  );
}
