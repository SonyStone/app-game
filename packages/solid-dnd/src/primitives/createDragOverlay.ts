import { type Accessor, createMemo, createSignal } from 'solid-js';
import { fromElement, type Rect } from '../core/rect';
import { type Vec2, of as vec2, Zero as Vec2Zero } from '../core/vec2';

export type DragOverlayOptions = Parameters<typeof createDragOverlay>[0];
export type DragOverlay = ReturnType<typeof createDragOverlay>;

// ============================================================================
// MARK: createDragOverlay
// ============================================================================

/**
 * A primitive that computes positioning for a floating drag overlay.
 *
 * Call `start(element, pointerPos)` when a drag begins to capture the
 * element's rect and compute the grab offset. During the drag, `position`
 * tracks `currentPosition - grabOffset` so the overlay follows the pointer
 * naturally.
 *
 * Call `stop()` when the drag ends.
 *
 * This uses an **imperative** start/stop API to avoid signal timing issues
 * — `onDragStart` can set drag state signals AND start the overlay in the
 * correct order, ensuring the source element is measured before any state
 * changes collapse it.
 *
 * ## Usage
 *
 * ```tsx
 * const sensor = createDragSensor({ ... });
 * const overlay = createDragOverlay({
 *   currentPosition: () => sensor.position() ?? Vec2.Zero,
 * });
 *
 * // In onDragStart:
 * overlay.start(sourceElement, e.position);
 *
 * // In onDragEnd / onDragCancel:
 * overlay.stop();
 *
 * // Render:
 * <Show when={overlay.active()}>
 *   <div style={{
 *     position: 'fixed',
 *     left: `${overlay.position().x}px`,
 *     top: `${overlay.position().y}px`,
 *     width: `${overlay.size().x}px`,
 *   }}>
 *     {overlayContent}
 *   </div>
 * </Show>
 * ```
 */
export function createDragOverlay(options: {
  /**
   * Current pointer position (page coordinates) during drag.
   * Updated every pointer move. Comes from `createDragSensor`.
   */
  currentPosition: Accessor<Vec2 | null>;
}) {
  const [isActive, setIsActive] = createSignal(false);
  const [grabOffset, setGrabOffset] = createSignal<Vec2>(Vec2Zero);
  const [capturedRect, setCapturedRect] = createSignal<Rect | undefined>(undefined);

  function start(element: Pick<Element, 'getBoundingClientRect'>, pointerPosition: Vec2): void {
    const rect = fromElement(element);
    if (rect) {
      setGrabOffset(vec2(pointerPosition.x - rect.x, pointerPosition.y - rect.y));
      setCapturedRect(rect);
    } else {
      setGrabOffset(Vec2Zero);
      setCapturedRect(undefined);
    }
    setIsActive(true);
  }

  function stop(): void {
    setIsActive(false);
    setGrabOffset(Vec2Zero);
    setCapturedRect(undefined);
  }

  const position = createMemo<Vec2>(() => {
    if (!isActive()) {
      return Vec2Zero;
    }
    const pos = options.currentPosition();
    if (!pos) {
      return Vec2Zero;
    }
    const offset = grabOffset();
    return vec2(pos.x - offset.x, pos.y - offset.y);
  });

  const size = createMemo<Vec2>(() => {
    const rect = capturedRect();
    if (!rect) {
      return Vec2Zero;
    }

    return vec2(rect.width, rect.height);
  });

  return {
    rect: {
      /**
       * Top-left position for the overlay (page coordinates).
       * Use with `position: fixed; left: ...; top: ...;` on the overlay element.
       *
       * Returns `Vec2.Zero` when not active.
       */
      get x() {
        return position().x;
      },
      get y() {
        return position().y;
      },
      /**
       * Width and height of the source element at drag start.
       * Use to size the overlay to match the original item.
       *
       * Returns `Vec2.Zero` when not active.
       */
      get width() {
        return size().x;
      },
      get height() {
        return size().y;
      }
    } as const,
    /**
     * The source element's bounding rect captured at drag start.
     * Useful for creating a clone or snapshot.
     *
     * Returns `undefined` when not active.
     */
    sourceRect: capturedRect,
    /** Whether the overlay should be visible. */
    active: isActive,
    /**
     * Activate the overlay. Call in `onDragStart` with the source element
     * and the pointer position at that moment.
     *
     * Captures the element's bounding rect and computes the grab offset
     * (pointer position relative to element's top-left corner).
     */
    start,
    /** Deactivate the overlay. Call when drag ends or cancels. */
    stop
  } as const;
}
