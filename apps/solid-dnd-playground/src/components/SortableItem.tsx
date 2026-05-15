import { Show, type JSX } from 'solid-js';
import type { DemoItem } from '../data';
import { CheckIcon, GripIcon } from './icons';
import { GHOST_CLASS } from './styles';

// ============================================================================
// MARK: SortableItem
// ============================================================================

/**
 * Unified sortable item that adapts its layout via `@container` queries.
 *
 * - **Narrow** (< 320 px / `@xs`): vertical card — color swatch, label, id.
 * - **Wide** (≥ 320 px / `@xs`): horizontal row — grip icon, dot, label, id.
 *
 * An inner wrapper uses `@container` (`container-type: inline-size`) so
 * child elements switch between layouts automatically based on the item's
 * own width, which is determined by the parent grid / flex container.
 */
export type SortableItemProps = {
  readonly item: DemoItem;
  readonly isDragged: boolean;
  readonly isSelected: boolean;
  readonly onPointerDown: (ev: PointerEvent) => void;
  readonly ref: (el: HTMLDivElement) => void;
  /** Override the visual style when dragged. Default: semi-transparent ghost. */
  readonly draggedClass?: string;
  readonly class?: string;
  readonly itemId?: string;
  readonly testId?: string;
};

export function SortableItem(props: SortableItemProps): JSX.Element {
  const stateClass = () => {
    if (props.isDragged) return props.draggedClass ?? GHOST_CLASS;
    if (props.isSelected) {
      return 'border-purple-500/40 bg-purple-500/10 ring-1 ring-purple-500/20';
    }
    return 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/8';
  };

  return (
    <div
      ref={props.ref}
      onPointerDown={props.onPointerDown}
      data-item-id={props.itemId}
      data-testid={props.testId}
      role="option"
      aria-selected={props.isSelected}
      aria-roledescription="sortable item"
      class={`cursor-grab touch-none rounded-lg border transition-all select-none active:cursor-grabbing ${stateClass()} ${props.class ?? ''}`}
    >
      <div class="@container w-full">
        {/* Inner content — switches between column (card) and row layout at @xs */}
        <div class="flex flex-col items-center gap-2 p-4 @xs:flex-row @xs:gap-3 @xs:px-4 @xs:py-3">
          {/* Grip / check icon — visible only in row mode */}
          <div class="hidden shrink-0 @xs:block">
            <Show when={props.isSelected} fallback={<GripIcon />}>
              <CheckIcon />
            </Show>
          </div>

          {/* Color swatch — large square in card mode, small circle in row mode */}
          <div
            class="h-8 w-8 shrink-0 rounded @xs:h-3 @xs:w-3 @xs:rounded-full"
            style={{ background: props.item.color }}
          />

          {/* Label */}
          <span class={`text-xs @xs:text-sm ${props.isSelected ? 'text-purple-200' : 'text-neutral-200'}`}>
            {props.item.label}
          </span>

          {/* ID */}
          <span class="font-mono text-[10px] text-neutral-500 @xs:ml-auto @xs:text-xs">{props.item.id}</span>
        </div>
      </div>
    </div>
  );
}
