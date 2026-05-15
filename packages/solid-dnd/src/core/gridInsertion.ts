// ============================================================================
// Grid Insertion — Compute drop position in a grid layout
// ============================================================================

import { type ResolvedGrid, cellToIndex, indexToCell, pointToCell } from './gridLayout';
import type { Place } from './place';
import type { Rect } from './rect';
import type { Vec2 } from './vec2';

// ============================================================================
// MARK: getGridInsertionPoint
// ============================================================================

/**
 * Given a pointer position, find the best insertion point in a grid layout.
 *
 * ## Algorithm
 *
 * When `getRectForItem` is provided (recommended), uses actual DOM rects:
 * 1. Check if the pointer is directly inside any item's bounding rect.
 * 2. If not (pointer is in a gap or empty space), find the nearest item by
 *    distance-to-rect.
 * 3. Use left/right half of the target item to decide before/after.
 *
 * This approach is robust when the visual grid contains extra elements
 * (like a gap placeholder) that shift items from their mathematical positions.
 *
 * Without `getRectForItem`, falls back to mathematical cell computation:
 * 1. Map pointer to nearest grid cell via `pointToCell`.
 * 2. Left half → before this cell's item; right half → after.
 *
 * @param position       Current pointer position.
 * @param containerKey   Key of the container.
 * @param items          Ordered item keys (excluding dragged items).
 * @param grid           Resolved grid dimensions.
 * @param containerRect  Bounding rect of the grid container.
 * @param getRectForItem Optional: measure actual item rects for accurate hit testing.
 *                       Falls back to computed cell rects.
 */
export function getGridInsertionPoint<K>(
  position: Vec2,
  containerKey: K,
  items: K[],
  grid: ResolvedGrid,
  containerRect: Rect,
  getRectForItem?: (key: K) => Rect | undefined
): Place<K> | undefined {
  // Reject pointer outside container
  if (
    position.x < containerRect.x ||
    position.x > containerRect.x + containerRect.width ||
    position.y < containerRect.y ||
    position.y > containerRect.y + containerRect.height
  ) {
    return undefined;
  }

  // Empty grid → append
  if (items.length === 0) {
    return { parent: containerKey, before: null };
  }

  // ── When real rects are available, use them for hit testing ────────────
  // This handles the case where extra elements (like a gap placeholder)
  // shift items from their mathematical grid positions.
  if (getRectForItem) {
    // 1. Direct hit: pointer is inside an item's rect
    for (let i = 0; i < items.length; i++) {
      const rect = getRectForItem(items[i]);
      if (!rect) continue;
      if (
        position.x >= rect.x &&
        position.x <= rect.x + rect.width &&
        position.y >= rect.y &&
        position.y <= rect.y + rect.height
      ) {
        return insertionFromHalf(position.x, rect, i, items, containerKey);
      }
    }

    // 2. No direct hit — pointer is in a gap or empty space.
    //    Use mathematical grid to check if we're beyond the last item.
    const origin = { x: containerRect.x, y: containerRect.y };
    const cell = pointToCell(position, grid, origin);
    const flatIndex = cellToIndex(cell, grid.columns);
    if (flatIndex >= items.length) {
      return { parent: containerKey, before: null };
    }

    // 3. Find nearest item by distance-to-rect (clamped Euclidean)
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < items.length; i++) {
      const rect = getRectForItem(items[i]);
      if (!rect) continue;
      const dx = Math.max(rect.x - position.x, 0, position.x - (rect.x + rect.width));
      const dy = Math.max(rect.y - position.y, 0, position.y - (rect.y + rect.height));
      const dist = dx * dx + dy * dy;
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }

    const bestRect = getRectForItem(items[bestIdx]);
    if (bestRect) {
      return insertionFromHalf(position.x, bestRect, bestIdx, items, containerKey);
    }
    return { parent: containerKey, before: null };
  }

  // ── Mathematical fallback (no getRectForItem) ─────────────────────────
  const origin = { x: containerRect.x, y: containerRect.y };
  const cell = pointToCell(position, grid, origin);
  const flatIndex = cellToIndex(cell, grid.columns);

  if (flatIndex >= items.length) {
    return { parent: containerKey, before: null };
  }

  const cellStep = grid.columnWidth + grid.colGap;
  const cellCenterX = origin.x + cell.col * cellStep + grid.columnWidth / 2;

  if (position.x < cellCenterX) {
    return { parent: containerKey, before: items[flatIndex] };
  } else {
    const nextIndex = flatIndex + 1;
    if (nextIndex >= items.length) {
      return { parent: containerKey, before: null };
    }
    return { parent: containerKey, before: items[nextIndex] };
  }
}

// ── Helper: left/right half insertion ────────────────────────────────────

function insertionFromHalf<K>(pointerX: number, rect: Rect, index: number, items: K[], containerKey: K): Place<K> {
  const centerX = rect.x + rect.width / 2;
  if (pointerX < centerX) {
    return { parent: containerKey, before: items[index] };
  }
  const next = index + 1;
  if (next >= items.length) {
    return { parent: containerKey, before: null };
  }
  return { parent: containerKey, before: items[next] };
}

// ============================================================================
// MARK: getGridIndicatorPosition
// ============================================================================

/**
 * Compute the pixel position for a drop indicator in a grid layout.
 *
 * Returns `{ x, y }` relative to the container, representing the top-left
 * of a vertical insertion line between cells.
 *
 * @param place          The insertion place.
 * @param items          Ordered item keys.
 * @param grid           Resolved grid dimensions.
 * @param containerRect  Container bounding rect.
 * @param getRectForItem Measure item rects for precise positioning.
 */
export function getGridIndicatorPosition<K>(
  place: Place<K> | undefined,
  items: ReadonlyArray<K>,
  grid: ResolvedGrid,
  containerRect: Rect,
  getRectForItem?: (key: K) => Rect | undefined
): { x: number; y: number; height: number } | undefined {
  if (!place) return undefined;
  if (items.length === 0) {
    return { x: 0, y: 0, height: grid.rowHeight };
  }

  const origin = { x: containerRect.x, y: containerRect.y };

  if (place.before !== null) {
    // Insert before this item → indicator at item's left edge
    const idx = items.indexOf(place.before as K);
    if (idx === -1) return undefined;

    if (getRectForItem) {
      const rect = getRectForItem(place.before as K);
      if (rect) {
        return {
          x: rect.x - origin.x,
          y: rect.y - origin.y,
          height: rect.height
        };
      }
    }

    // Fallback: compute from grid
    const cell = indexToCell(idx, grid.columns);
    return {
      x: cell.col * (grid.columnWidth + grid.colGap),
      y: cell.row * (grid.rowHeight + grid.rowGap),
      height: grid.rowHeight
    };
  }

  // Append: indicator at the right edge of the last item
  const lastIdx = items.length - 1;

  if (getRectForItem) {
    const rect = getRectForItem(items[lastIdx]);
    if (rect) {
      return {
        x: rect.x + rect.width - origin.x,
        y: rect.y - origin.y,
        height: rect.height
      };
    }
  }

  const lastCell = indexToCell(lastIdx, grid.columns);
  return {
    x: lastCell.col * (grid.columnWidth + grid.colGap) + grid.columnWidth,
    y: lastCell.row * (grid.rowHeight + grid.rowGap),
    height: grid.rowHeight
  };
}
