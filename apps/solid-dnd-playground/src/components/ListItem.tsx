import { Show, type JSX } from 'solid-js';
import type { DemoItem } from '../data';
import { CheckIcon, GripIcon } from './icons';
import { GHOST_CLASS } from './styles';

// ============================================================================
// MARK: ListItem
// ============================================================================

export type ListItemProps = {
  item: DemoItem;
  isDragged: boolean;
  isSelected: boolean;
  onPointerDown: (ev: PointerEvent) => void;
  ref: (el: HTMLDivElement) => void;
  /** Override the visual style when dragged. Default: semi-transparent ghost. */
  draggedClass?: string;
};

export function ListItem(props: ListItemProps): JSX.Element {
  const stateClass = () => {
    if (props.isDragged) return props.draggedClass ?? GHOST_CLASS;
    if (props.isSelected) {
      return 'border-purple-500/40 bg-purple-500/10 ring-1 ring-purple-500/20 hover:border-purple-400/50';
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
      class={`flex cursor-grab touch-none items-center gap-3 rounded-lg border px-4 py-3 transition-all select-none ${stateClass()}`}
    >
      <Show when={props.isSelected} fallback={<GripIcon />}>
        <CheckIcon />
      </Show>
      <div class="h-3 w-3 shrink-0 rounded-full" style={{ background: props.item.color }} />
      <span class={`text-sm ${props.isSelected ? 'text-purple-200' : 'text-neutral-200'}`}>{props.item.label}</span>
      <span class="ml-auto font-mono text-xs text-neutral-500">{props.item.id}</span>
    </div>
  );
}
