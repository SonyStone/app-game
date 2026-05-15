import type { JSX } from 'solid-js';
import type { DemoItem } from '../data';
import { GHOST_CLASS } from './styles';

// ============================================================================
// MARK: GridItem
// ============================================================================

export type GridItemProps = {
  item: DemoItem;
  isDragged: boolean;
  isSelected: boolean;
  onPointerDown: (ev: PointerEvent) => void;
  ref: (el: HTMLDivElement) => void;
  /** Override the visual style when dragged. Default: semi-transparent ghost. */
  draggedClass?: string;
};

export function GridItem(props: GridItemProps): JSX.Element {
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
      role="option"
      aria-selected={props.isSelected}
      aria-roledescription="sortable item"
      class={`flex cursor-grab touch-none flex-col items-center gap-2 rounded-lg border p-4 transition-all select-none active:cursor-grabbing ${stateClass()}`}
    >
      <div class="h-8 w-8 rounded" style={{ background: props.item.color }} />
      <span class={`text-xs ${props.isSelected ? 'text-purple-200' : 'text-neutral-300'}`}>{props.item.label}</span>
      <span class="font-mono text-[10px] text-neutral-500">{props.item.id}</span>
    </div>
  );
}
