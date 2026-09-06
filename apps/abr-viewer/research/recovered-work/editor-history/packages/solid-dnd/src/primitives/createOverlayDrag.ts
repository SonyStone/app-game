import { type MaybeAccessor, access, defer } from '@solid-primitives/utils';
import { type Accessor, batch, createEffect, createSignal } from 'solid-js';
import * as Place from '../core/place';
import { fromElement } from '../core/rect';
import { type Vec2, of as vec2, Zero as Vec2Zero } from '../core/vec2';
import { type DragOverlay, createDragOverlay } from './createDragOverlay';
import { type DragSensor, createDragSensor } from './createDragSensor';
import { type Flip, type FlipAnimateEntry, type FlipOptions, createFlip } from './createFlip';

// ============================================================================
// MARK: Types
// ============================================================================

export type OverlayDragOptions<K> = {
  /**
   * Element ref map shared between the overlay drag and the consumer's
   * `<For>` loop. The consumer must populate this with item `ref` callbacks
   * and also register the gap placeholder element under `GAP_KEY`.
   *
   * The primitive reads from this map but never writes to it — ownership
   * stays with the consumer.
   */
  elements: Map<K, HTMLElement>;

  /**
   * Compute the insertion point for a given position.
   *
   * The consumer wires this to `sortable.getInsertionPoint` or
   * `nestable.getInsertionPoint`. The primitive calls it during drag start,
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
  onBeforeDragStart?: (id: K) => K[];

  /**
   * Apply the drop — reorder items, move tree nodes, etc.
   * Called inside `flip.animate()` so the DOM change is FLIP-animated.
   */
  onDrop: (keys: K[], place: Place.Place<K>) => void;

  /**
   * Called when drag ends (after drop or cancel), inside the FLIP callback.
   * Use this for cleanup beyond what the primitive handles internally
   * (e.g., clearing selection, logging).
   */
  onReset?: () => void;

  /**
   * Called when a pointerdown doesn't result in a drag (click).
   * Wire selection handling here.
   */
  onClick?: (ev: PointerEvent, id: K) => void;

  /**
   * Called when drag starts, after state is set.
   * Useful for logging.
   */
  onDragStart?: (keys: K[], position: Vec2) => void;

  /**
   * Called when a successful drop occurs, before FLIP animates.
   * Useful for logging.
   */
  onDropLog?: (keys: K[], place: Place.Place<K>) => void;

  /**
   * Called when drag is cancelled.
   * Useful for logging.
   */
  onCancelLog?: () => void;

  // ── Sensor options ────────────────────────────────────────────────────

  /**
   * Pixel distance threshold before a pointerdown becomes a drag.
   * @default 5
   */
  threshold?: MaybeAccessor<number>;

  // ── FLIP options ──────────────────────────────────────────────────────

  /**
   * FLIP animation duration in ms.
   * @default 300
   */
  duration?: MaybeAccessor<number>;

  /**
   * FLIP easing function.
   * @default 'ease-out'
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
  onFlipAnimate?: (entries: FlipAnimateEntry[]) => void;

  /**
   * An accessor that changes whenever the visual display list changes
   * (e.g., `dropzone.displayKeys()`). The primitive watches this and
   * triggers `flip.playFromFirst()` during drag so items animate to
   * their new positions when the gap moves.
   *
   * If not provided, the consumer must call `drag.flip.playFromFirst()`
   * manually.
   */
  displayKeys?: Accessor<unknown>;
};

export type OverlayDrag<K> = {
  /** The underlying drag sensor. */
  sensor: DragSensor;
  /** The drag overlay (position, size, active). */
  overlay: DragOverlay;
  /** The FLIP animation controller. */
  flip: Flip;

  /** Keys currently being dragged. Empty when idle. */
  draggedIds: Accessor<K[]>;
  /** Current insertion point, or `undefined` when idle or outside bounds. */
  dropPlace: Accessor<Place.Place<K> | undefined>;
  /** Height of the source element at drag start. Use for gap placeholder sizing. */
  gapHeight: Accessor<number>;

  /**
   * Bind this to `onPointerDown` on each draggable item.
   * Pass the item's key and the PointerEvent.
   *
   * @example
   * ```tsx
   * <div onPointerDown={(ev) => drag.onPointerDown(item.id, ev)}>
   * ```
   */
  onPointerDown: (id: K, ev: PointerEvent) => void;
};

// ============================================================================
// MARK: createOverlayDrag
// ============================================================================

/**
 * High-level primitive that orchestrates overlay-based drag-and-drop.
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
 * The primitive uses the **overlay center** (not the raw cursor position) for
 * insertion point detection. This ensures the insertion zone matches the
 * visual position of the dragged item, regardless of where the user grabbed.
 *
 * ## What the consumer still owns
 *
 * - Item state (`items` signal, `setItems`)
 * - Element refs (`itemRefs` map, ref callbacks in JSX)
 * - `createSortable` / `createNestable` (provides `getInsertionPoint`)
 * - `createDropzone` (renders display keys with gap)
 * - Overlay JSX (`<Show when={drag.overlay.active()}>...`)
 * - Selection state (optional, wired via `onBeforeDragStart` + `onClick`)
 *
 * ## Usage
 *
 * ```tsx
 * const drag = createOverlayDrag({
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
export function createOverlayDrag<K>(options: OverlayDragOptions<K>): OverlayDrag<K> {
  // ── Internal state ──────────────────────────────────────────────────────
  const [draggedIds, setDraggedIds] = createSignal<K[]>([]);
  const [dropPlace, setDropPlace] = createSignal<Place.Place<K> | undefined>(undefined, {
    equals: Place.equals
  });
  const [gapHeight, setGapHeight] = createSignal(0);
  let pendingDragId: K | null = null;
  let moveSwallowed = false;

  const getDuration = (): number => access(options.duration) ?? 300;
  const isAnimEnabled = (): boolean => access(options.animEnabled) ?? true;

  const flipOptions: FlipOptions = {
    elements: options.elements as unknown as Map<string, HTMLElement>,
    easing: access(options.easing) ?? 'ease-out'
  };
  if (options.onFlipAnimate) {
    flipOptions.onAnimate = options.onFlipAnimate;
  }
  const flip = createFlip(flipOptions);

  const overlay = createDragOverlay({
    currentPosition: () => sensor.position() ?? Vec2Zero
  });

  // ── Insertion position (overlay center, not raw cursor) ─────────────────
  function insertionPos(): Vec2 | undefined {
    if (overlay.active()) {
      const pos = overlay.position();
      const size = overlay.size();
      return vec2(pos.x + size.x / 2, pos.y + size.y / 2);
    }
    return sensor.position() ?? undefined;
  }

  // ── Shared cleanup ──────────────────────────────────────────────────────
  function resetDragState(): void {
    pendingDragId = null;
    moveSwallowed = false;
    setDraggedIds([]);
    setDropPlace(undefined);
    setGapHeight(0);
    overlay.stop();
    options.onReset?.();
  }

  // ── Drag sensor ─────────────────────────────────────────────────────────
  const sensor = createDragSensor({
    threshold: access(options.threshold) ?? 5,
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
      if (id === null) return;

      // 1. Measure source element BEFORE any state changes
      const sourceEl = options.elements.get(id);
      if (sourceEl) {
        const rect = fromElement(sourceEl);
        if (rect) setGapHeight(rect.height);
        overlay.start(sourceEl, e.position);
      }

      // 2. Let consumer prepare (snapshot rects, expand selection, etc.)
      const ids = options.onBeforeDragStart?.(id) ?? [id];

      // 3. Capture FLIP positions before DOM changes
      if (isAnimEnabled()) flip.captureFirst();

      // 4. Set drag state (batched so displayKeys computes once)
      batch(() => {
        setDraggedIds(ids);
        setDropPlace(options.getInsertionPoint(insertionPos() ?? e.position));
      });

      options.onDragStart?.(ids, e.position);
    },

    onDragMove: () => {
      if (flip.isAnimating()) {
        moveSwallowed = true;
        return;
      }
      moveSwallowed = false;
      if (isAnimEnabled()) flip.captureFirst();
      const pos = insertionPos();
      if (pos) setDropPlace(options.getInsertionPoint(pos));
    },

    onDragEnd: () => {
      // Re-evaluate swallowed move before reading final place
      if (moveSwallowed) {
        moveSwallowed = false;
        const pos = insertionPos();
        if (pos) setDropPlace(options.getInsertionPoint(pos));
      }

      const place = dropPlace();
      const ids = draggedIds();
      const dur = isAnimEnabled() ? getDuration() : 0;

      if (place && ids.length > 0) {
        flip.animate(
          () => {
            options.onDrop(ids, place);
            options.onDropLog?.(ids, place);
            resetDragState();
          },
          { duration: dur }
        );
      } else {
        flip.animate(() => resetDragState(), { duration: dur });
      }
    },

    onDragCancel: () => {
      const dur = isAnimEnabled() ? getDuration() : 0;
      options.onCancelLog?.();
      flip.animate(() => resetDragState(), { duration: dur });
    }
  });

  // ── Animate display key changes during drag ──────────────────────────
  if (options.displayKeys) {
    createEffect(
      defer(options.displayKeys, () => {
        if (sensor.isDragging() && isAnimEnabled()) {
          flip.playFromFirst();
        }
      })
    );
  }

  // ── Re-evaluate insertion when FLIP ends (swallowed moves) ──────────────
  createEffect(
    defer(
      () => flip.isAnimating(),
      (animating) => {
        if (!animating && moveSwallowed && sensor.isDragging()) {
          moveSwallowed = false;
          const pos = insertionPos();
          if (pos) {
            flip.captureFirst();
            setDropPlace(options.getInsertionPoint(pos));
          }
        }
      }
    )
  );

  // ── Per-item pointer down ───────────────────────────────────────────────
  function onPointerDown(id: K, ev: PointerEvent): void {
    pendingDragId = id;
    sensor.onPointerDown(ev);
  }

  return {
    sensor,
    overlay,
    flip,
    draggedIds,
    dropPlace,
    gapHeight,
    onPointerDown
  };
}
