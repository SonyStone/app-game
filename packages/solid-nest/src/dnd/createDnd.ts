import { Accessor, createMemo, createSignal, onCleanup, untrack } from 'solid-js';
import { EventHandler, ReorderEvent } from '../events';
import { createBlockItemId, ItemId } from '../Item';
import { Vec2 } from '../util/types';
import { VirtualTree } from '../virtual-tree';
import { DropTarget, findDropTarget } from './findDropTarget';

export type DragState<K> = {
  keys: K[];
  topItem: ItemId;
  /** Offset from the pointer to the top-left corner of the dragged block. */
  offset: Vec2;
  size: Vec2;
  tags: string[];
};

/**
 * Pointer-driven reordering over a layout that stays still while dragging.
 *
 * Mouse and pen drags start once the pointer travels `dragThreshold` pixels. Touch keeps
 * native scrolling: a drag starts only after holding still for `touchDragDelay` milliseconds,
 * and moving first abandons the gesture so the browser can scroll. While dragging, the nearest
 * scrollable ancestor auto-scrolls near its edges and the drop target follows both pointer and scroll.
 */
export function createDnd<K, T>(
  tree: Accessor<VirtualTree<K, T>>,
  options: Accessor<{ dragThreshold: number; touchDragDelay: number }>,
  itemElements: Map<ItemId, HTMLElement>,
  getBlocksToDrag: (key: K) => T[],
  onReorder: EventHandler<ReorderEvent<K>>
) {
  const [dragState, setDragState] = createSignal<DragState<K>>();
  const [pointerPos, setPointerPos] = createSignal(Vec2.Zero);
  const [dropTarget, setDropTarget] = createSignal<DropTarget<K>>();

  // Event handlers need current values synchronously, so the gesture lives outside signals.
  let gesture: Gesture<K> | undefined;

  const measure = (id: ItemId) => {
    const element = itemElements.get(id);
    return element?.isConnected ? element.getBoundingClientRect() : undefined;
  };

  const start = (current: Gesture<K>) => {
    const input = untrack(tree);
    const blocks = getBlocksToDrag(current.key);
    const topBlock = blocks.find((block) => input.containsChildBlock(input.key(block), current.key));
    const topItem = topBlock && createBlockItemId(input.key(topBlock));
    const topRect = topItem && measure(topItem);
    if (!topItem || !topRect) {
      return end();
    }

    const tags = new Set<string>();
    for (const block of blocks) {
      const { tag } = input.options(block);
      if (tag) {
        tags.add(tag);
      }
    }

    const drag: DragState<K> = {
      keys: blocks.map(input.key),
      topItem,
      offset: { x: topRect.x - current.origin.x, y: topRect.y - current.origin.y },
      size: { x: topRect.width, y: topRect.height },
      tags: [...tags]
    };
    current.drag = drag;
    current.scroller = scrollParent(itemElements.get(input.root.id));
    if (current.touch) {
      current.onTouchDragStart();
    }

    setPointerPos(current.pointer);
    setDragState(drag);
    current.frame = requestAnimationFrame(() => tick(current));
  };

  // Each frame scrolls near the edges and re-targets, so the target follows content scrolled
  // under a still pointer as well as pointer movement.
  const tick = (current: Gesture<K>) => {
    const drag = current.drag!;
    const scrolled = current.scroller && autoScroll(current.scroller, current.pointer);
    if (scrolled || current.dirty) {
      current.dirty = false;
      const target = findDropTarget(untrack(tree), new Set(drag.keys), drag.tags, current.pointer, measure);
      if (!sameTarget(target, current.target)) {
        current.target = target;
        setDropTarget(target);
      }
    }

    current.frame = requestAnimationFrame(() => tick(current));
  };

  const end = () => {
    if (!gesture) {
      return;
    }

    clearTimeout(gesture.timer);
    cancelAnimationFrame(gesture.frame);
    gesture.listeners.abort();
    gesture = undefined;
    setDragState(undefined);
    setDropTarget(undefined);
  };

  const onPointerMove = (ev: PointerEvent) => {
    const current = gesture;
    if (!current || ev.pointerId !== current.pointerId) {
      return;
    }

    current.pointer = { x: ev.clientX, y: ev.clientY };
    current.dirty = true;
    if (current.drag) {
      setPointerPos(current.pointer);
      return;
    }

    const distance = Math.hypot(ev.clientX - current.origin.x, ev.clientY - current.origin.y);
    if (current.touch) {
      // Moving before the long press completes is a scroll, which the browser now owns.
      if (distance > TouchSlop) {
        end();
      }
    } else if (distance >= options().dragThreshold) {
      start(current);
    }
  };

  const onPointerUp = (ev: PointerEvent) => {
    if (ev.pointerId !== gesture?.pointerId) {
      return;
    }

    const { drag, target } = gesture;
    end();
    if (drag && target) {
      onReorder({ keys: drag.keys, place: target.place });
    }
  };

  const onPointerCancel = (ev: PointerEvent) => {
    if (ev.pointerId === gesture?.pointerId) {
      end();
    }
  };

  /**
   * Arms a drag from a pointer press on a drag handle; ignored while another gesture is active.
   *
   * @param onTouchDragStart Called when a long press turns into a drag, since touch defers selection.
   */
  const onDragHandleDown = (ev: PointerEvent, key: K, onTouchDragStart: () => void) => {
    if (ev.button !== 0 || gesture) {
      return;
    }

    const origin = { x: ev.clientX, y: ev.clientY };
    const touch = ev.pointerType === 'touch';
    const listeners = new AbortController();
    const current: Gesture<K> = {
      key,
      pointerId: ev.pointerId,
      touch,
      origin,
      pointer: origin,
      dirty: true,
      frame: 0,
      timer: undefined,
      listeners,
      onTouchDragStart
    };
    gesture = current;
    if (touch) {
      current.timer = setTimeout(() => start(current), options().touchDragDelay);
    }

    const { signal } = listeners;
    document.addEventListener('pointermove', onPointerMove, { signal });
    document.addEventListener('pointerup', onPointerUp, { signal });
    document.addEventListener('pointercancel', onPointerCancel, { signal });
    document.addEventListener('scroll', () => (current.dirty = true), { signal, capture: true, passive: true });
    // Touch scrolls until the long press completes; pen and mouse presses on a handle never scroll.
    document.addEventListener(
      'touchmove',
      (ev) => {
        if ((current.drag || !current.touch) && ev.cancelable) {
          ev.preventDefault();
        }
      },
      { signal, passive: false }
    );
    // A long press would otherwise open the context menu or a text-selection callout.
    document.addEventListener('contextmenu', (ev) => ev.preventDefault(), { signal });
    document.addEventListener(
      'keydown',
      (ev) => {
        if (ev.key === 'Escape') {
          end();
        }
      },
      { signal }
    );
  };

  onCleanup(end);

  const dragPosition = createMemo(() => {
    const state = dragState();
    if (!state) return new DOMRect();

    const { x, y } = pointerPos();
    return new DOMRect(x + state.offset.x, y + state.offset.y, state.size.x, state.size.y);
  });

  // Visualise the dragged item(s)
  const dragTree = createMemo(() => {
    const state = dragState();
    return state && untrack(tree).extractBlocks(state.keys);
  });

  return { dragState, dropTarget, dragPosition, dragTree, onDragHandleDown };
}

/** Distance a touch may wander during the long press before it counts as scrolling. */
const TouchSlop = 10;

/** Distance from a scroller edge, in pixels, where auto-scroll starts. */
const ScrollEdge = 48;

/** Auto-scroll speed at the very edge, in pixels per frame. */
const MaxScrollSpeed = 16;

type Gesture<K> = {
  key: K;
  pointerId: number;
  touch: boolean;
  origin: Vec2;
  pointer: Vec2;
  /** Whether the pointer or content moved since the drop target was last computed. */
  dirty: boolean;
  frame: number;
  timer: ReturnType<typeof setTimeout> | undefined;
  listeners: AbortController;
  onTouchDragStart: () => void;
  drag?: DragState<K>;
  target?: DropTarget<K>;
  scroller?: HTMLElement;
};

function scrollParent(element: HTMLElement | undefined): HTMLElement | undefined {
  for (let node = element?.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
      return node;
    }
  }

  return document.scrollingElement instanceof HTMLElement ? document.scrollingElement : undefined;
}

/** Scrolls faster the closer the pointer gets to an edge; returns whether anything scrolled. */
function autoScroll(scroller: HTMLElement, pointer: Vec2) {
  const rect =
    scroller === document.scrollingElement
      ? new DOMRect(0, 0, innerWidth, innerHeight)
      : scroller.getBoundingClientRect();
  const edge = Math.min(ScrollEdge, rect.height / 4);
  const fromTop = pointer.y - rect.top;
  const fromBottom = rect.bottom - pointer.y;
  let delta = 0;
  if (fromTop < edge) {
    delta = -Math.ceil(MaxScrollSpeed * Math.min(1, (edge - fromTop) / edge));
  } else if (fromBottom < edge) {
    delta = Math.ceil(MaxScrollSpeed * Math.min(1, (edge - fromBottom) / edge));
  }

  if (!delta) {
    return false;
  }

  const before = scroller.scrollTop;
  scroller.scrollTop += delta;
  return scroller.scrollTop !== before;
}

function sameTarget<K>(a: DropTarget<K> | undefined, b: DropTarget<K> | undefined) {
  if (!a || !b) {
    return a === b;
  }

  const [ra, rb] = [a.indicator, b.indicator];
  return (
    a.kind === b.kind &&
    a.place.parent === b.place.parent &&
    a.place.before === b.place.before &&
    ra.x === rb.x &&
    ra.y === rb.y &&
    ra.width === rb.width &&
    ra.height === rb.height
  );
}
