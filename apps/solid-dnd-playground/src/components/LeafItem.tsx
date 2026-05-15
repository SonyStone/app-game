import type { JSX } from 'solid-js';
import type { NodeData } from '../data';
import { GripIcon } from './icons';
import { GHOST_CLASS } from './styles';

// ============================================================================
// MARK: LeafItem
// ============================================================================

export type LeafItemProps = {
  id: string;
  node: NodeData;
  isDragged: boolean;
  onPointerDown: (ev: PointerEvent) => void;
  ref: (el: HTMLDivElement) => void;
  /** Override the visual style when dragged. Default: semi-transparent ghost. */
  draggedClass?: string;
};

export function LeafItem(props: LeafItemProps): JSX.Element {
  const stateClass = () => {
    if (props.isDragged) return props.draggedClass ?? GHOST_CLASS;
    return 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/8';
  };

  return (
    <div
      ref={props.ref}
      onPointerDown={props.onPointerDown}
      role="option"
      aria-roledescription="sortable item"
      class={`flex cursor-grab touch-none items-center gap-3 rounded-lg border px-3 py-2.5 transition-all select-none ${stateClass()}`}
    >
      <GripIcon class="h-3.5 w-3.5 text-neutral-500" />
      <div class="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: props.node.color }} />
      <span class="text-sm text-neutral-200">{props.node.label}</span>
      <span class="ml-auto font-mono text-xs text-neutral-500">{props.id}</span>
    </div>
  );
}
