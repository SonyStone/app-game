import { access, type MaybeAccessor } from '@solid-primitives/utils';
import { createMemo } from 'solid-js';
import { getLinearInsertionPoint } from '../core/linearInsertion';
import type { Place } from '../core/place';
import { accepts, wouldCycle } from '../core/tagConstraints';
import type { NestableContainer } from '../core/types';
import type { Vec2 } from '../core/vec2';

// Re-export so existing consumers importing from this module still work.
export type { NestableContainer } from '../core/types';

// ============================================================================
// MARK: Types
// ============================================================================

export type NestableOptions<K> = Parameters<typeof createNestable<K>>[0];
export type Nestable<K> = ReturnType<typeof createNestable<K>>;

// ============================================================================
// MARK: createNestable
// ============================================================================

/**
 * A primitive for nested sortable containers.
 *
 * Given a set of containers (each with their own ordered item lists),
 * determines the best insertion point across the entire tree based on
 * pointer position, tag constraints, and cycle prevention.
 *
 * This extends `createSortable`'s single-container model to a multi-container
 * tree. Each container is still a vertical list internally.
 *
 * ## How container selection works
 *
 * When the pointer is over multiple nested containers, the "deepest" (smallest
 * area) container wins — this gives the most specific drop target. Tag constraints
 * and cycle checks further filter candidates.
 *
 * ```
 * ┌─── Root container ─────────────────────────┐
 * │  ┌─── Group A ──────────┐                  │
 * │  │  item-1              │  ← pointer here  │
 * │  │  item-2              │    drops into     │
 * │  │                      │    Group A        │
 * │  └──────────────────────┘                  │
 * │  ┌─── Group B ──────────┐                  │
 * │  │  item-3              │                  │
 * │  └──────────────────────┘                  │
 * └────────────────────────────────────────────┘
 * ```
 *
 * @example
 * ```tsx
 * const nestable = createNestable({
 *   containers: () => [
 *     { key: 'root', items: () => ['groupA', 'groupB'], getRect: ..., getContainerRect: ... },
 *     { key: 'groupA', items: () => ['item-1', 'item-2'], acceptTags: ['item'], getRect: ..., getContainerRect: ... },
 *     { key: 'groupB', items: () => ['item-3'], acceptTags: ['item'], getRect: ..., getContainerRect: ... },
 *   ],
 *   dragTags: () => ['item'],
 * });
 *
 * const place = nestable.getInsertionPoint(pointerPos);
 * // → { parent: 'groupA', before: 'item-2' }
 * ```
 */
export function createNestable<K>(options: {
  /** All containers in the tree. Order determines priority for same-depth overlaps. */
  containers: MaybeAccessor<ReadonlyArray<NestableContainer<K>>>;
  /** Tags of the currently dragged items. Used for accept/reject. */
  dragTags?: MaybeAccessor<ReadonlyArray<string> | undefined>;
  /**
   * Keys of items currently being dragged.
   * Used for cycle prevention: can't drop a container into itself or its descendants.
   */
  draggedKeys?: MaybeAccessor<ReadonlyArray<K>>;
  /**
   * Returns the parent container key for a given key, or `undefined` for root-level containers.
   * Required for cycle detection.
   */
  getParent?: (key: K) => K | undefined;
}) {
  function getContainers(): ReadonlyArray<NestableContainer<K>> {
    return access(options.containers);
  }

  function getDraggedKeys(): ReadonlyArray<K> {
    return access(options.draggedKeys) ?? [];
  }

  // ── Container lookup (memoized) ─────────────────────────────────────────
  const containerMap = createMemo(() => {
    const map = new Map<K, NestableContainer<K>>();
    for (const c of getContainers()) {
      map.set(c.key, c);
    }
    return map;
  });

  // ── Find best insertion point ───────────────────────────────────────────
  function getInsertionPoint(position: Vec2): Place<K> | undefined {
    const containers = getContainers();
    const tags = access(options.dragTags);
    const acceptedTags = tags ? [...tags] : undefined;
    const draggedKeys = getDraggedKeys();
    const getParent = options.getParent;

    // 1. Find all containers whose rect contains the pointer
    let best: { container: NestableContainer<K>; area: number } | undefined;

    for (const container of containers) {
      const rect = container.getContainerRect();
      if (!rect) {
        continue;
      }

      if (
        position.x >= rect.x &&
        position.x <= rect.x + rect.width &&
        position.y >= rect.y &&
        position.y <= rect.y + rect.height
      ) {
        // 2. Tag constraint check
        if (!accepts(container.acceptTags, acceptedTags)) {
          continue;
        }

        // 3. Cycle check — skip if any dragged key would create a cycle
        if (draggedKeys.length > 0 && getParent) {
          const hasCycle = draggedKeys.some((dk) => wouldCycle(dk, container.key, getParent));
          if (hasCycle) {
            continue;
          }
        }

        const area = rect.width * rect.height;
        if (!best || area < best.area) {
          best = { container, area };
        }
      }
    }

    if (!best) {
      return undefined;
    }

    // 4. Compute insertion point within the chosen container
    return getInsertionPointInContainer(best.container, position);
  }

  // ── Helper: items minus dragged keys ────────────────────────────────────
  function activeItems(container: NestableContainer<K>): ReadonlyArray<K> {
    const all = container.items();
    const dKeys = getDraggedKeys();
    if (dKeys.length === 0) {
      return all;
    }

    const dragSet = new Set(dKeys);
    return all.filter((k) => !dragSet.has(k));
  }

  // ── Insertion point within a single container ──────────────────────────
  function getInsertionPointInContainer(container: NestableContainer<K>, position: Vec2): Place<K> {
    const keys = activeItems(container);
    // Delegate to shared vertical center-line algorithm
    return getLinearInsertionPoint(keys, container.key, position, container.getRect);
  }

  // ── Indicator offset ──────────────────────────────────────────────────
  function getIndicatorOffset(place: Place<K> | undefined): { containerKey: K; offset: number } | undefined {
    if (!place) {
      return undefined;
    }

    const container = containerMap().get(place.parent);
    if (!container) {
      return undefined;
    }

    const containerRect = container.getContainerRect();
    if (!containerRect) {
      return undefined;
    }

    if (place.before !== null) {
      const rect = container.getRect(place.before);
      if (!rect) {
        return undefined;
      }
      return { containerKey: place.parent, offset: rect.y - containerRect.y };
    }

    // Append: bottom edge of last non-dragged item
    const keys = activeItems(container);
    if (keys.length === 0) return { containerKey: place.parent, offset: 0 };

    const lastRect = container.getRect(keys[keys.length - 1]);
    if (!lastRect) {
      return undefined;
    }
    return { containerKey: place.parent, offset: lastRect.y + lastRect.height - containerRect.y };
  }

  return {
    /**
     * Given a pointer position, returns the best insertion point across ALL containers.
     *
     * Resolution strategy:
     * 1. Find all containers whose bounding rect contains the pointer.
     * 2. Filter by tag constraints (container must accept the drag tags).
     * 3. Filter by cycle prevention (can't drop into own descendants).
     * 4. Among remaining, pick the deepest (smallest area = most specific) container.
     * 5. Within that container, compute the vertical insertion point.
     *
     * Returns `undefined` if no valid container contains the pointer.
     */
    getInsertionPoint,
    /**
     * Returns the Y offset (relative to the matched container's top) where a drop
     * indicator should be drawn for the given insertion `place`.
     * Also returns the container key so the consumer knows which container to position
     * the indicator in.
     */
    getIndicatorOffset,
    /** All containers, for iteration in rendering. */
    containers: getContainers
  };
}
