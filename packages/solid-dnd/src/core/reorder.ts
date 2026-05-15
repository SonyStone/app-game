import type { Place } from './place';

/**
 * Pure utility that moves one or more items to a new position in an array.
 *
 * Given an array of items, a set of keys to move, and a target {@link Place},
 * returns a **new** array with the moved items inserted at the target position.
 * The relative order of moved items is preserved (their original order in the array).
 *
 * @param items    The current ordered array.
 * @param movedKeys  Keys of the items to move — accepts an array or a `Set`.
 * @param place    Where to insert — `{ before: key }` or `{ before: null }` (append).
 * @param getKey   Extracts the key from an item.
 * @returns A new array with items reordered.
 *
 * @example
 * ```ts
 * const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
 * const result = reorderItems(items, ['c'], { parent: 'list', before: 'a' }, i => i.id);
 * // → [{ id: 'c' }, { id: 'a' }, { id: 'b' }, { id: 'd' }]
 *
 * // Also accepts a Set:
 * const result2 = reorderItems(items, new Set(['c']), { parent: 'list', before: 'a' }, i => i.id);
 * ```
 */
export function reorderItems<K, T>(
  items: T[],
  movedKeys: ReadonlyArray<K> | ReadonlySet<K>,
  place: Place<K>,
  getKey: (item: T) => K
): T[] {
  if (items.length === 0) {
    return items;
  }

  let movedSet: ReadonlySet<K> | undefined;
  if (movedKeys instanceof Set) {
    movedSet = movedKeys;
  } else if (Array.isArray(movedKeys) && movedKeys.length > 0) {
    movedSet = new Set<K>(movedKeys);
  }

  if (!movedSet || movedSet.size === 0) {
    return items;
  }

  const moved: T[] = [];
  const without: T[] = [];
  let insertionIndex = -1;

  for (const item of items) {
    const key = getKey(item);
    if (movedSet.has(key)) {
      moved.push(item);
      continue;
    }

    if (place.before !== null && insertionIndex === -1 && key === place.before) {
      insertionIndex = without.length;
    }

    without.push(item);
  }

  if (moved.length === 0) {
    return items;
  }

  if (place.before === null) {
    return [...without, ...moved];
  }

  if (insertionIndex === -1) {
    return [...without, ...moved];
  }

  return [...without.slice(0, insertionIndex), ...moved, ...without.slice(insertionIndex)];
}
