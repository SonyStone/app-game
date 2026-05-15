import { createLazyMemo } from '@solid-primitives/memo';
import { ReactiveSet } from '@solid-primitives/set';
import { type MaybeAccessor, access, defer } from '@solid-primitives/utils';
import { type Accessor, batch, createEffect, createMemo, createSignal } from 'solid-js';
import { GapKey, isGapKey } from '..';
import * as Place from '../core/place';
import { type Vec2, of as vec2, Zero as Vec2Zero } from '../core/vec2';
import { createDragOverlay } from '../primitives/createDragOverlay';
import { createDragSensor } from '../primitives/createDragSensor';
import { type FlipAnimateEntry, createFlip } from '../primitives/createFlip';
import { createGapState } from '../primitives/createGapState';

export type DragControllerOptions<K> = Parameters<typeof createDragController<K>>[0];
export type DragController<K> = ReturnType<typeof createDragController<K>>;

function createDragging<K>() {
  const draggedIdsSet = new ReactiveSet<K>();
  const draggedIds = createLazyMemo(() => [...draggedIdsSet]);
  const isDragging = createMemo(() => draggedIdsSet.size > 0);

  return {
    draggedIdsSet,
    draggedIds,
    isDragging,
    clear(): void {
      draggedIdsSet.clear();
    }
  };
}

/**
 * High-level composite that orchestrates overlay-based drag-and-drop.
 *
 * Composes `createDragSensor`, `createDragOverlay`, and `createFlip` into a
 * single coherent flow with correct ordering:
 *
 * 1. **Drag start**: measure source → call `onBeforeDragStart` → snapshot →
 *    capture FLIP → set state → overlay appears, gap opens.
 * 2. **Drag move**: skip if FLIP animating → capture FLIP → update insertion
 *    point using overlay center (not raw cursor).
 * 3. **FLIP ends**: re-evaluate any swallowed move.
 * 4. **Drop**: apply reorder inside `flip.animate()` → reset.
 * 5. **Cancel**: reset inside `flip.animate()`.
 *
 * The controller uses the **overlay center** (not the raw cursor position) for
 * insertion point detection. This ensures the insertion zone matches the
 * visual position of the dragged item, regardless of where the user grabbed.
 *
 * ## What the consumer still owns
 *
 * - Item state (`items` signal, `setItems`)
 * - Element refs (`itemRefs` map, ref callbacks in JSX)
 * - `createSortable` / `createNestable` (provides `getInsertionPoint`)
 * - `createDisplayList` (renders display keys with gap)
 * - Overlay JSX (`<Show when={drag.overlay.active()}>...`)
 * - Selection state (optional, wired via `onBeforeDragStart` + `onClick`)
 *
 * `createFlip` also supports a `keys + getElement` form, but this controller
 * continues to accept a keyed `elements` map because it reads the same element
 * collection repeatedly during drag, overlay, and FLIP operations.
 *
 * ## Usage
 *
 * ```tsx
 * const drag = createDragController({
 *   elements: itemRefs,
 *   getInsertionPoint: (pos) => sortable.getInsertionPoint(pos),
 *   onBeforeDragStart: (id) => {
 *     sortable.snapshotRects([id]);
 *     return [id];
 *   },
 *   onDrop: (keys, place) => {
 *     setItems(prev => reorderItems(prev, keys, place, i => i.id));
 *   },
 *   onReset: () => sortable.clearSnapshot(),
 * });
 * ```
 */
export function createDragController<K>(options: {
  /**
   * Element ref map shared between the drag controller and the consumer's
   * `<For>` loop. The consumer must populate this with item `ref` callbacks
   * and also register the gap placeholder element under `GAP_KEY`.
   *
   * The controller reads from this map but never writes to it — ownership
   * stays with the consumer.
   */
  elements: Map<K, HTMLElement>;

  /**
   * Compute the insertion point for a given position.
   *
   * The consumer wires this to `sortable.getInsertionPoint` or
   * `nestable.getInsertionPoint`. The controller calls it during drag start,
   * every drag move, and when re-evaluating after FLIP completes.
   */
  getInsertionPoint: (position: Vec2) => Place.Place<K> | undefined;

  /**
   * Called once at drag start, before any state changes, with the IDs that
   * are about to be dragged. Use this to snapshot rects, set up selection,
   * etc.
   *
   * Return the final array of dragged keys. This allows the consumer to
   * expand a single clicked key into a multi-selection.
   *
   * @example
   * ```ts
   * onBeforeDragStart: (id) => {
   *   const ids = selection.isSelected(id) ? selection.selected() : [id];
   *   sortable.snapshotRects(ids);
   *   return ids;
   * }
   * ```
   */
  onBeforeDragStart?: (id: Exclude<K, GapKey>) => ReadonlyArray<Exclude<K, GapKey>>;

  /**
   * Apply the drop — reorder items, move tree nodes, etc.
   * Called inside `flip.animate()` so the DOM change is FLIP-animated.
   */
  onDrop: (keys: ReadonlySet<Exclude<K, GapKey>>, place: Place.Place<K>) => void;

  /**
   * Called when drag ends (after drop or cancel), inside the FLIP callback.
   * Use this for cleanup beyond what the controller handles internally
   * (e.g., clearing selection, logging).
   */
  onReset?: () => void;

  /**
   * Called when a pointerdown doesn't result in a drag (click).
   * Wire selection handling here.
   */
  onClick?: (ev: PointerEvent, id: Exclude<K, GapKey>) => void;

  /**
   * Called when drag starts, after state is set.
   * Useful for logging.
   */
  onDragStart?: (keys: ReadonlyArray<Exclude<K, GapKey>>, position: Vec2) => void;

  /**
   * Called when drag is cancelled.
   * Useful for logging.
   */
  onCancel?: () => void;

  // MARK: Sensor options

  /**
   * Pixel distance threshold before a pointerdown becomes a drag.
   * @default 5
   */
  threshold?: MaybeAccessor<number>;

  // MARK: FLIP options

  /**
   * FLIP animation duration in ms.
   * @default 300
   */
  duration?: MaybeAccessor<number>;

  /**
   * FLIP easing function.
   * @default 'linear'
   */
  easing?: MaybeAccessor<string>;

  /**
   * Whether FLIP animations are enabled.
   * When false, DOM changes are applied immediately without animation.
   * @default true
   */
  animEnabled?: MaybeAccessor<boolean>;

  /**
   * Called with FLIP animation entries when they play.
   * Useful for debug overlays.
   */
  onFlipAnimate?: (entries: ReadonlyArray<FlipAnimateEntry<K>>) => void;

  /**
   * An accessor that changes whenever the visual display list changes
   * (e.g., `display.displayKeys()`). The controller watches this and
   * triggers `flip.playFromFirst()` during drag so items animate to
   * their new positions when the gap moves.
   *
   * If not provided, the consumer must call `drag.flip.playFromFirst()`
   * manually.
   */
  displayKeys?: Accessor<unknown>;
}) {
  const dragging = createDragging<Exclude<K, GapKey>>();
  const gap = createGapState();

  const [dropPlace, setDropPlace] = createSignal<Place.Place<K> | undefined>(undefined, {
    equals: Place.equals
  });

  let pendingDragId: Exclude<K, GapKey> | null = null;
  let moveSwallowed = false;

  const duration = createLazyMemo(() => (isAnimEnabled() ? (access(options.duration) ?? 300) : 0));

  const isAnimEnabled = (): boolean => access(options.animEnabled) ?? true;

  const flip = createFlip({
    elements: options.elements,
    easing: options.easing,
    onAnimate: options.onFlipAnimate,
    duration: duration
  });

  const dragOverlay = createDragOverlay({
    currentPosition: () => sensor.position() ?? Vec2Zero
  });

  function insertionPos(): Vec2 | undefined {
    if (dragOverlay.active()) {
      const { x, y, width, height } = dragOverlay.rect;
      return vec2(x + width / 2, y + height / 2);
    }
    return sensor.position() ?? undefined;
  }

  function updateDropPlace(position?: Vec2): void {
    if (!position) {
      return;
    }

    setDropPlace(options.getInsertionPoint(position));
  }

  function resetDragState(): void {
    pendingDragId = null;
    moveSwallowed = false;
    dragging.clear();

    setDropPlace(undefined);
    gap.resetSize();
    dragOverlay.stop();
    options.onReset?.();
  }

  const sensor = createDragSensor({
    threshold: options.threshold ?? 5,
    proxyCapture: true,

    onClick: (ev) => {
      const id = pendingDragId;
      pendingDragId = null;
      if (id !== null) {
        options.onClick?.(ev, id);
      }
    },

    onDragStart: (e) => {
      const id = pendingDragId;
      if (id === null || id === undefined || isGapKey(id)) {
        return;
      }

      // 1. Measure source element BEFORE any state changes
      const sourceEl = options.elements.get(id);
      if (sourceEl) {
        gap.setSizeFromElement(sourceEl);
        dragOverlay.start(sourceEl, e.position);
      }

      // 2. Let consumer prepare (snapshot rects, expand selection, etc.)
      const ids = options.onBeforeDragStart?.(id) ?? [id];

      // 3. Capture FLIP positions before DOM changes
      if (isAnimEnabled()) {
        flip.captureFirst();
      }

      // 4. Set drag state (batched so displayKeys computes once)
      batch(() => {
        for (const id of ids) {
          dragging.draggedIdsSet.add(id);
        }
        updateDropPlace(insertionPos() ?? e.position);
      });

      options.onDragStart?.(ids, e.position);
    },

    onDragMove: () => {
      if (flip.isAnimating()) {
        moveSwallowed = true;
        return;
      }
      moveSwallowed = false;
      if (isAnimEnabled()) {
        flip.captureFirst();
      }
      updateDropPlace(insertionPos());
    },

    onDragEnd: () => {
      // Re-evaluate swallowed move before reading final place
      if (moveSwallowed) {
        moveSwallowed = false;
        updateDropPlace(insertionPos());
      }

      const place = dropPlace();

      if (place && dragging.draggedIdsSet.size > 0) {
        flip.animate(() => {
          options.onDrop(dragging.draggedIdsSet, place);
          resetDragState();
        });
      } else {
        flip.animate(() => resetDragState());
      }
    },

    onDragCancel: () => {
      options.onCancel?.();
      flip.animate(() => resetDragState());
    }
  });

  // MARK: Animate display key changes during drag
  if (options.displayKeys) {
    createEffect(
      defer(options.displayKeys, () => {
        if (sensor.isDragging() && isAnimEnabled()) {
          flip.playFromFirst();
        }
      })
    );
  }

  // MARK: Re-evaluate insertion when FLIP ends (swallowed moves)
  createEffect(
    defer(
      () => flip.isAnimating(),
      (animating) => {
        if (!animating && moveSwallowed && sensor.isDragging()) {
          moveSwallowed = false;
          const pos = insertionPos();
          if (!pos) {
            return;
          }

          flip.captureFirst();
          updateDropPlace(pos);
        }
      }
    )
  );

  // MARK: Per-item pointer down
  function onPointerDown(id: Exclude<K, GapKey>, ev: PointerEvent): void {
    pendingDragId = id;
    sensor.onPointerDown(ev);
  }

  return {
    /** The underlying drag sensor. */
    sensor,
    /** The drag overlay (position, size, active). */
    overlay: dragOverlay,
    /** The FLIP animation controller. */
    flip,

    /** Keys currently being dragged. Empty when idle. */
    draggedIdsSet: dragging.draggedIdsSet,

    draggedIds: dragging.draggedIds,

    isDragging: dragging.isDragging,

    /** Current insertion point, or `undefined` when idle or outside bounds. */
    dropPlace,
    /** Height of the source element at drag start. Use for gap placeholder sizing. */
    gapHeight: gap.height,

    gapWidth: gap.width,

    /**
     * Bind this to `onPointerDown` on each draggable item.
     * Pass the item's key and the PointerEvent.
     *
     * @example
     * ```tsx
     * <div onPointerDown={(ev) => drag.onPointerDown(item.id, ev)}>
     * ```
     */
    onPointerDown
  };
}
