import { createRAF } from '@solid-primitives/raf';
import { createSignal, onCleanup } from 'solid-js';
import { treeSelectionModifiers, type TreeSelection, type TreeSelectionModifiers } from './createTreeSelection';
import type { TreeViewItem, TreeViewModel } from './createTreeView';
import { TREE_VIEW_VERTICAL_INSET } from './TreeView';

/**
 * Creates Finder-style drag-to-select for a virtual tree. A mouse or pen press on empty space —
 * outside every row, or inside row content marked with `data-tree-marquee-zone` — draws a
 * rectangle once the pointer travels a few pixels, and every row the rectangle crosses vertically
 * becomes selected. As in Finder, the empty space of a row that carries a drag, by default any
 * selected row, is no start: a press there begins the row's own native drag of the selection. Rows are hit from the tree model and the fixed row height, so rows scrolled
 * out of the virtual window are selected too; the container scrolls while the pointer is held
 * near or beyond its top or bottom edge.
 *
 * Without modifiers the rectangle replaces the selection; Shift adds its rows to the selection
 * held when the gesture began and Ctrl/Cmd toggles them. Escape restores that selection. A click
 * on empty space without travel clears the selection, or selects the row level with the pointer
 * when it lands beside a row (for example in the indentation gutter). Touch presses never start
 * a marquee, so touch scrolling keeps working. The press blocks native drag and text selection
 * until release, and swallows the click that follows a drawn rectangle.
 */
export function createTreeMarqueeSelection<T>(props: {
  /** Headless tree whose visible rows are hit by the rectangle. */
  tree: TreeViewModel<T>;
  /** Selection replaced on every move of the rectangle. */
  selection: TreeSelection<T>;
  /** Scrolling element that renders the tree; it must be positioned so the rectangle can be drawn inside it. */
  element: () => HTMLElement | undefined;
  /** Exact height of every row, matching the virtual list. */
  rowHeight: number;
  /**
   * Whether a row's empty space starts a native drag instead of a rectangle. Defaults to selected
   * rows; pass a stricter test when some selected rows cannot be dragged.
   */
  dragsFromEmptySpace?: (item: TreeViewItem<T>) => boolean;
  /**
   * Receives the row nearest the end of a gesture that changed the selection, or `undefined`
   * when the selection became empty, so the caller can move keyboard focus without reselecting.
   */
  onFinish?: (item: TreeViewItem<T> | undefined) => void;
}) {
  const [rect, setRect] = createSignal<TreeMarqueeRect | null>(null);
  const [, startAutoScroll, stopAutoScroll] = createRAF(autoScroll);
  let gesture: MarqueeGesture | null = null;
  let previousFrameTime: number | null = null;
  onCleanup(() => endGesture());

  return {
    /** Starts a gesture; attach to the scrolling element's `pointerdown`. */
    onPointerDown(event: PointerEvent): void {
      const element = props.element();
      if (
        gesture ||
        !element ||
        event.button !== 0 ||
        event.pointerType === 'touch' ||
        !(event.target instanceof Element) ||
        !element.contains(event.target) ||
        !isMarqueeStart(event.target) ||
        pressesDraggedRow(event.target)
      ) {
        return;
      }

      const start = contentPoint(element, event.clientX, event.clientY);
      gesture = {
        pointerId: event.pointerId,
        element,
        start,
        clientX: event.clientX,
        clientY: event.clientY,
        modifiers: treeSelectionModifiers(event),
        initialIds: new Set(props.selection.selectedItems().map((item) => item.id)),
        pressedOnRow: event.target.closest(TREE_ROW_SELECTOR) !== null,
        phase: 'pressed',
        release: listenDuringGesture(element)
      };
    },
    /** Current rectangle in the scrolling element's content coordinates, or `null` while none is drawn. */
    rect
  } as const;

  function pressesDraggedRow(target: Element): boolean {
    const rowId = target.closest<HTMLElement>(TREE_ROW_SELECTOR)?.dataset.nodeId;
    const item =
      rowId === undefined ? undefined : props.tree.visibleItems().find((candidate) => candidate.id === rowId);
    if (!item) {
      return false;
    }

    return props.dragsFromEmptySpace ? props.dragsFromEmptySpace(item) : props.selection.isSelected(item);
  }

  function listenDuringGesture(element: HTMLElement): () => void {
    const options = { capture: true } as const;
    window.addEventListener('pointermove', handlePointerMove, options);
    window.addEventListener('pointerup', handlePointerUp, options);
    window.addEventListener('pointercancel', handlePointerCancel, options);
    window.addEventListener('keydown', handleKeyDown, options);
    window.addEventListener('contextmenu', handleContextMenu, options);
    window.addEventListener('dragstart', cancelEvent, options);
    window.addEventListener('selectstart', cancelEvent, options);
    element.addEventListener('scroll', updateSelection);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove, options);
      window.removeEventListener('pointerup', handlePointerUp, options);
      window.removeEventListener('pointercancel', handlePointerCancel, options);
      window.removeEventListener('keydown', handleKeyDown, options);
      window.removeEventListener('contextmenu', handleContextMenu, options);
      window.removeEventListener('dragstart', cancelEvent, options);
      window.removeEventListener('selectstart', cancelEvent, options);
      element.removeEventListener('scroll', updateSelection);
    };
  }

  function handlePointerMove(event: PointerEvent): void {
    if (!gesture || event.pointerId !== gesture.pointerId) {
      return;
    }

    gesture.clientX = event.clientX;
    gesture.clientY = event.clientY;
    if (gesture.phase === 'canceled') {
      return;
    }

    if (gesture.phase === 'pressed') {
      const point = contentPoint(gesture.element, event.clientX, event.clientY);
      if (Math.hypot(point.x - gesture.start.x, point.y - gesture.start.y) < START_DISTANCE) {
        return;
      }

      gesture.phase = 'drawing';
      if (!gesture.element.hasPointerCapture(event.pointerId)) {
        gesture.element.setPointerCapture(event.pointerId);
      }
      startAutoScroll();
    }

    updateSelection();
  }

  function handlePointerUp(event: PointerEvent): void {
    if (!gesture || event.pointerId !== gesture.pointerId) {
      return;
    }

    const finished = gesture;
    endGesture();
    if (finished.phase === 'pressed') {
      if (!finished.pressedOnRow) {
        clickBesideRows(finished);
      }
      return;
    }

    // The click after a drawn or canceled rectangle must not select the row under the pointer.
    suppressNextClick();
    if (finished.phase === 'drawing') {
      props.onFinish?.(props.selection.primaryItem());
    }
  }

  function handlePointerCancel(event: PointerEvent): void {
    if (!gesture || event.pointerId !== gesture.pointerId) {
      return;
    }

    if (gesture.phase === 'drawing') {
      restoreInitialSelection(gesture);
    }
    endGesture();
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || gesture?.phase !== 'drawing') {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    // Keep listening until release, so the press still cannot start a native drag or a click.
    gesture.phase = 'canceled';
    restoreInitialSelection(gesture);
    stopDrawing();
  }

  /** A context menu (Ctrl+click on macOS) takes over the press; it is not a click on empty space. */
  function handleContextMenu(): void {
    if (gesture?.phase === 'pressed') {
      endGesture();
    }
  }

  function restoreInitialSelection(canceled: MarqueeGesture): void {
    const items = props.tree.visibleItems();
    props.selection.replace(canceled.initialIds, {
      anchorId: items.find((item) => canceled.initialIds.has(item.id))?.id ?? null,
      leadId: null
    });
  }

  function endGesture(): void {
    if (!gesture) {
      return;
    }

    gesture.release();
    if (gesture.element.hasPointerCapture(gesture.pointerId)) {
      gesture.element.releasePointerCapture(gesture.pointerId);
    }
    gesture = null;
    stopDrawing();
  }

  function stopDrawing(): void {
    stopAutoScroll();
    previousFrameTime = null;
    setRect(null);
  }

  function clickBesideRows(press: MarqueeGesture): void {
    const item = rowAt(press.start.y);
    if (item) {
      props.selection.click(item, press.modifiers);
      props.onFinish?.(item);
      return;
    }

    if (!press.modifiers.toggle && !press.modifiers.range) {
      props.selection.clear();
    }
  }

  function updateSelection(): void {
    if (gesture?.phase !== 'drawing') {
      return;
    }

    const { element, start, modifiers, initialIds } = gesture;
    const limits = contentLimits(element);
    const current = clampPoint(contentPoint(element, gesture.clientX, gesture.clientY), limits);
    const origin = clampPoint(start, limits);
    setRect({
      left: Math.min(origin.x, current.x),
      top: Math.min(origin.y, current.y),
      width: Math.abs(current.x - origin.x),
      height: Math.abs(current.y - origin.y)
    });

    const items = props.tree.visibleItems();
    const [first, last] = rowSpan(Math.min(origin.y, current.y), Math.max(origin.y, current.y), items.length);
    const hitIds = items.slice(first, last + 1).map((item) => item.id);
    props.selection.replace(combineSelection(initialIds, hitIds, modifiers), {
      anchorId: nearestRow(items, origin.y)?.id ?? null,
      leadId: hitIds.length > 0 ? (nearestRow(items, current.y)?.id ?? null) : null
    });
  }

  function autoScroll(time: number): void {
    const frameTime = previousFrameTime === null ? FRAME_MS : Math.min(time - previousFrameTime, MAX_FRAME_MS);
    previousFrameTime = time;
    if (gesture?.phase !== 'drawing') {
      return;
    }

    const bounds = gesture.element.getBoundingClientRect();
    const speed = autoScrollSpeed(gesture.clientY, bounds.top, bounds.bottom);
    if (speed !== 0) {
      // The element's scroll listener refreshes the rectangle and selection.
      gesture.element.scrollTop += (speed * frameTime) / 1000;
    }
  }

  function rowAt(contentY: number): TreeViewItem<T> | undefined {
    const index = Math.floor((contentY - TREE_VIEW_VERTICAL_INSET) / props.rowHeight);
    return index >= 0 ? props.tree.visibleItems()[index] : undefined;
  }

  function nearestRow(items: readonly TreeViewItem<T>[], contentY: number): TreeViewItem<T> | undefined {
    const index = Math.floor((contentY - TREE_VIEW_VERTICAL_INSET) / props.rowHeight);
    return items[Math.max(0, Math.min(items.length - 1, index))];
  }

  function rowSpan(top: number, bottom: number, rowCount: number): readonly [number, number] {
    const first = Math.max(0, Math.floor((top - TREE_VIEW_VERTICAL_INSET) / props.rowHeight));
    const last = Math.min(rowCount - 1, Math.floor((bottom - TREE_VIEW_VERTICAL_INSET) / props.rowHeight));
    return bottom < TREE_VIEW_VERTICAL_INSET ? [0, -1] : [first, last];
  }

  function contentLimits(element: HTMLElement): ContentPoint {
    const rowsHeight = props.tree.visibleItems().length * props.rowHeight + 2 * TREE_VIEW_VERTICAL_INSET;
    return { x: element.clientWidth, y: Math.max(element.clientHeight, rowsHeight) };
  }
}

/** Marquee rectangle in the scrolling element's content coordinates. */
export type TreeMarqueeRect = Readonly<{ left: number; top: number; width: number; height: number }>;

type ContentPoint = Readonly<{ x: number; y: number }>;

type MarqueeGesture = {
  pointerId: number;
  element: HTMLElement;
  start: ContentPoint;
  clientX: number;
  clientY: number;
  modifiers: TreeSelectionModifiers;
  initialIds: ReadonlySet<string>;
  pressedOnRow: boolean;
  /** Below the start distance, drawing the rectangle, or canceled by Escape until release. */
  phase: 'pressed' | 'drawing' | 'canceled';
  release: () => void;
};

function isMarqueeStart(target: Element): boolean {
  return target.closest(TREE_MARQUEE_ZONE_SELECTOR) !== null || target.closest(TREE_ROW_SELECTOR) === null;
}

function contentPoint(element: HTMLElement, clientX: number, clientY: number): ContentPoint {
  const bounds = element.getBoundingClientRect();
  return {
    x: clientX - bounds.left - element.clientLeft + element.scrollLeft,
    y: clientY - bounds.top - element.clientTop + element.scrollTop
  };
}

function clampPoint(point: ContentPoint, limits: ContentPoint): ContentPoint {
  return {
    x: Math.max(0, Math.min(limits.x, point.x)),
    y: Math.max(0, Math.min(limits.y, point.y))
  };
}

function combineSelection(
  initialIds: ReadonlySet<string>,
  hitIds: readonly string[],
  modifiers: TreeSelectionModifiers
): Iterable<string> {
  if (modifiers.toggle) {
    const ids = new Set(initialIds);
    for (const id of hitIds) {
      if (initialIds.has(id)) {
        ids.delete(id);
      } else {
        ids.add(id);
      }
    }
    return ids;
  }

  return modifiers.range ? [...initialIds, ...hitIds] : hitIds;
}

/** Pixels per second; grows with the pointer's distance into the edge band and beyond it. */
function autoScrollSpeed(clientY: number, top: number, bottom: number): number {
  if (clientY < top + AUTO_SCROLL_EDGE) {
    return -Math.min(AUTO_SCROLL_MAX_SPEED, (top + AUTO_SCROLL_EDGE - clientY) * AUTO_SCROLL_ACCELERATION);
  }
  if (clientY > bottom - AUTO_SCROLL_EDGE) {
    return Math.min(AUTO_SCROLL_MAX_SPEED, (clientY - bottom + AUTO_SCROLL_EDGE) * AUTO_SCROLL_ACCELERATION);
  }
  return 0;
}

function suppressNextClick(): void {
  const swallow = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    window.removeEventListener('click', swallow, true);
  };
  window.addEventListener('click', swallow, true);
  // A release outside the press target fires no click; drop the guard after this task.
  setTimeout(() => window.removeEventListener('click', swallow, true), 0);
}

/** Cancels an event before it reaches its target, so row drag handlers never see the press. */
function cancelEvent(event: Event): void {
  event.preventDefault();
  event.stopPropagation();
}

const TREE_ROW_SELECTOR = '[role="treeitem"]';
const TREE_MARQUEE_ZONE_SELECTOR = '[data-tree-marquee-zone]';
const START_DISTANCE = 4;
const AUTO_SCROLL_EDGE = 24;
const AUTO_SCROLL_ACCELERATION = 20;
const AUTO_SCROLL_MAX_SPEED = 1600;
const FRAME_MS = 1000 / 60;
const MAX_FRAME_MS = 100;
