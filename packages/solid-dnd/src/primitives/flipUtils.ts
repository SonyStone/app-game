import { equals, fromElement, type Rect } from '../core/rect';

export type MeasurableElement = Pick<HTMLElement, 'isConnected' | 'getBoundingClientRect'>;

/**
 * The inverse transform needed to visually move an element from its
 * "Last" (new) position back to its "First" (old) position.
 *
 * Applied as `translate(dx, dy) scale(scaleX, scaleY)` at animation start,
 * then animated to `translate(0, 0) scale(1, 1)` to smoothly arrive at
 * the new position and size.
 */
export type FlipDelta = Readonly<{
  dx: number;
  dy: number;
  /** Horizontal scale factor (first.width / last.width). 1 = no change. */
  scaleX: number;
  /** Vertical scale factor (first.height / last.height). 1 = no change. */
  scaleY: number;
}>;

/**
 * Captures the current bounding rect of every element in the map.
 * This is the "First" or "Last" step of FLIP.
 *
 * @param elements Map of item keys → DOM elements to measure.
 * @returns A new map of item keys → snapshot rects (viewport-relative).
 */
export function measureElements<K>(elements: ReadonlyMap<K, MeasurableElement>): Map<K, Rect> {
  const snapshots = new Map<K, Rect>();
  for (const [key, el] of elements) {
    // Skip detached elements (e.g., stale refs from items removed by <For>).
    // getBoundingClientRect() on detached elements returns all-zero rects,
    // which would produce incorrect FLIP deltas.
    if (!el.isConnected) {
      continue;
    }
    snapshots.set(key, fromElement(el));
  }
  return snapshots;
}

/**
 * Compares two element snapshots for exact positional equality.
 * Used by createFlip to detect whether animation targets have changed.
 */
export function snapshotsEqual<K>(a: ReadonlyMap<K, Rect>, b: ReadonlyMap<K, Rect>): boolean {
  if (a.size !== b.size) {
    return false;
  }
  for (const [key, snapA] of a) {
    const snapB = b.get(key);
    if (!snapB) {
      return false;
    }
    if (!equals(snapA, snapB)) {
      return false;
    }
  }
  return true;
}

/**
 * Computes the inverse translation for each element that moved between
 * the "First" and "Last" snapshots. This is the "Invert" step of FLIP.
 *
 * - Elements present in both snapshots that **moved**: included with delta.
 * - Elements that **didn't move**: excluded (delta is zero).
 * - Elements only in `last` (newly added): excluded — they just appear.
 * - Elements only in `first` (removed): excluded — they're already gone.
 *
 * @param first Snapshot taken before the DOM change.
 * @param last  Snapshot taken after the DOM change.
 * @returns Map of keys → inverse translation deltas for elements that moved.
 */
export function calculateDeltas<K>(first: ReadonlyMap<K, Rect>, last: ReadonlyMap<K, Rect>): Map<K, FlipDelta> {
  const deltas = new Map<K, FlipDelta>();
  for (const [key, lastSnap] of last) {
    const firstSnap = first.get(key);
    if (!firstSnap) {
      continue;
    }

    const dx = firstSnap.x - lastSnap.x;
    const dy = firstSnap.y - lastSnap.y;

    const scaleX = lastSnap.width > 0 ? firstSnap.width / lastSnap.width : 1;
    const scaleY = lastSnap.height > 0 ? firstSnap.height / lastSnap.height : 1;

    // Skip elements that didn't move or change size (avoids unnecessary animations)
    if (dx === 0 && dy === 0 && scaleX === 1 && scaleY === 1) {
      continue;
    }

    deltas.set(key, { dx, dy, scaleX, scaleY });
  }

  return deltas;
}
