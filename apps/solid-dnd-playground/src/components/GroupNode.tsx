import type { JSX } from 'solid-js';
import type { NodeData } from '../data';
import { GripIcon } from './icons';

// ============================================================================
// MARK: GroupNode
// ============================================================================

const DEPTH_COLORS = ['border-white/15', 'border-white/10', 'border-white/5'];
const GHOST_CLASS = 'opacity-40';

export type GroupNodeProps = {
  id: string;
  node: NodeData;
  depth: number;
  isDragged: boolean;
  onPointerDown: (ev: PointerEvent) => void;
  ref: (el: HTMLDivElement) => void;
  /** Override the visual style when dragged. Default: `opacity-40`. */
  draggedClass?: string;
  children: JSX.Element;
};

export function GroupNode(props: GroupNodeProps): JSX.Element {
  const borderClass = () => DEPTH_COLORS[Math.min(props.depth, DEPTH_COLORS.length - 1)];
  const draggedClass = () => (props.isDragged ? (props.draggedClass ?? GHOST_CLASS) : '');

  return (
    <div
      ref={props.ref}
      role="option"
      aria-roledescription="sortable group"
      class={`rounded-lg border border-dashed bg-white/3 ${borderClass()} ${draggedClass()}`}
    >
      {/* Draggable group header */}
      <div
        onPointerDown={props.onPointerDown}
        class="flex cursor-grab touch-none items-center gap-2 rounded-t-lg px-3 py-2 select-none hover:bg-white/5"
      >
        <GripIcon class="h-3.5 w-3.5 text-neutral-500" />
        <div class="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: props.node.color }} />
        <span class="text-xs font-semibold text-neutral-400">{props.node.label}</span>
        <span class="ml-auto font-mono text-xs text-neutral-600">{props.id}</span>
      </div>

      {/* Nested children */}
      <div class="px-2 pb-2">{props.children}</div>
    </div>
  );
}
