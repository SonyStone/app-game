import type { Place } from './place';
import type { Rect } from './rect';
import type { ListAxis } from './types';
import type { Vec2 } from './vec2';

// ============================================================================
// MARK: getLinearInsertionPoint
// ============================================================================

/**
 * Finds the insertion point within a one-dimensional sequence of items based on pointer position.
 *
 * Uses the **midpoint-between-items** algorithm: the boundary between two
 * adjacent zones is the midpoint of the gap between the two items. For the
 * last item, the boundary is at the item's trailing edge (not its center).
 *
 * This is more accurate for overlay-based drag-and-drop where the probe
 * position is the overlay center (which has height), not a bare cursor.
 * With center-line detection, the overlay can visually cover an item but
 * the algorithm says "append" because the overlay center is just barely
 * below the item center. The midpoint-between-items approach avoids this
 * by placing boundaries at the visual gaps between items.
 *
 * ## How it works
 *
 * ```
 *   ──── before A ────
 *   ┌──────────────┐
 *   │      A       │
 *   └──────────────┘
 *   ─ midpoint(A,B) ─  ← boundary between "before A" and "before B"
 *   ┌──────────────┐
 *   │      B       │
 *   └──────────────┘
 *   ─── B.bottom ───  ← boundary between "before B" and "append"
 *   ──── append ──────
 * ```
 *
 * @param keys     Active (non-dragged) item keys in display order.
 * @param parentKey  The container key — used as `parent` in the returned Place.
 * @param position   Current pointer position (same coordinate space as rects).
 * @param getRect    Returns the bounding rect for an item, or `undefined` if unmeasured.
 * @param axis       Primary sequence axis. Defaults to `'vertical'`.
 * @returns The best insertion Place. Always returns a value (never `undefined`).
 *
 * @example
 * ```ts
 * const place = getLinearInsertionPoint(
 *   ['a', 'b', 'c'],
 *   'container',
 *   { x: 100, y: 150 },
 *   (key) => rects.get(key),
 * );
 * // → { parent: 'container', before: 'b' }
 * ```
 */
export function getLinearInsertionPoint<K>(
  keys: ReadonlyArray<K>,
  parentKey: K,
  position: Vec2,
  getRect: (key: K) => Rect | undefined,
  axis: ListAxis = 'vertical'
): Place<K> {
  // Empty sequence → append
  if (keys.length === 0) {
    return { parent: parentKey, before: null };
  }

  for (let i = 0; i < keys.length; i++) {
    const rect = getRect(keys[i]);
    if (!rect) continue;

    const rectStart = axis === 'horizontal' ? rect.x : rect.y;
    const rectSize = axis === 'horizontal' ? rect.width : rect.height;

    let boundary: number;

    if (i < keys.length - 1) {
      // For non-last items: boundary is the midpoint between this item's
      // trailing edge and the next item's leading edge.
      const nextRect = getRect(keys[i + 1]);
      if (nextRect) {
        const nextStart = axis === 'horizontal' ? nextRect.x : nextRect.y;
        boundary = (rectStart + rectSize + nextStart) / 2;
      } else {
        // Fallback if next rect unavailable: use this item's center
        boundary = rectStart + rectSize / 2;
      }
    } else {
      // Last item: boundary is at the trailing edge.
      // This prevents "append" from triggering too aggressively — the probe
      // must be past the entire last item, not just its center.
      boundary = rectStart + rectSize;
    }

    const probe = axis === 'horizontal' ? position.x : position.y;
    if (probe < boundary) {
      return { parent: parentKey, before: keys[i] };
    }
  }

  // Below all items → append at end
  return { parent: parentKey, before: null };
}
