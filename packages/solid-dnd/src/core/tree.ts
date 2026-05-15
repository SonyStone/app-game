import { entries } from '@solid-primitives/utils';

import type { Place } from './place';
import type { Rect } from './rect';
import type { NestableContainer } from './types';

// ============================================================================
// Tree — Pure utilities for tree-structured data
// ============================================================================

/**
 * A tree represented as a map from parent key → ordered child keys.
 *
 * The root of the tree is stored under the `root` key.
 *
 * @example
 * ```ts
 * const tree: Tree = {
 *   root: ['groupA', 'groupB'],
 *   groupA: ['item-1', 'item-2'],
 *   groupB: ['item-3'],
 * };
 * ```
 */
export type Tree<K extends string = string> = Record<K | 'root', K[]>;

// ============================================================================
// MARK: move
// ============================================================================

/**
 * Move a node to a new position in the tree. Returns a **new** tree.
 *
 * 1. Removes `key` from its current parent's child list.
 * 2. Inserts it at `place` (before a sibling, or appended).
 * 3. If the moved key is a container (has a children entry), preserves it.
 *
 * This is the tree equivalent of {@link reorderItems} for flat lists.
 *
 * @example
 * ```ts
 * const tree = { root: ['a', 'b'], a: ['x', 'y'], b: [] };
 * const next = Tree.move(tree, 'y', { parent: 'b', before: null });
 * // → { root: ['a', 'b'], a: ['x'], b: ['y'] }
 * ```
 */
export function move<K extends string>(tree: Tree<K>, key: K, place: Place<K>): Tree<K> {
  const result = { ...tree };

  // 1. Remove from current parent (O(1) lookup via parentMap)
  const parents = parentMap(tree);
  const currentParent = parents.get(key);
  if (currentParent !== undefined) {
    result[currentParent] = (result[currentParent] as K[]).filter((k) => k !== key) as K[];
  }

  // 2. Insert at target position
  const targetKids = [...(result[place.parent] ?? [])];
  if (place.before === null) {
    targetKids.push(key);
  } else {
    const idx = targetKids.indexOf(place.before as K);
    if (idx === -1) {
      targetKids.push(key);
    } else {
      targetKids.splice(idx, 0, key);
    }
  }
  result[place.parent] = targetKids as K[];

  // 3. Ensure container nodes keep their children entry
  if (key in tree && !(key in result && Array.isArray(result[key]))) {
    result[key] = [] as unknown as K[];
  }

  return result;
}

// MARK: parentMap

/**
 * Build a child→parent lookup map from a tree.
 *
 * @example
 * ```ts
 * const tree = { root: ['a', 'b'], a: ['x', 'y'], b: [] };
 * const map = Tree.parentMap(tree);
 * // map.get('x') → 'a'
 * // map.get('a') → 'root'
 * ```
 */
export function parentMap<K extends string>(tree: Tree<K>): Map<K, K | 'root'> {
  const map = new Map<K, K | 'root'>();
  for (const [parent, kids] of entries(tree)) {
    for (const kid of kids) {
      map.set(kid, parent);
    }
  }
  return map;
}

// ============================================================================
// MARK: containerKeys
// ============================================================================

/**
 * Collect all keys in the tree that are containers (have a children entry),
 * starting from `root` and walking recursively.
 *
 * @param tree         The tree structure.
 * @param isContainer  Predicate that decides if a key is a container.
 *                     Defaults to checking if the key has a children entry in the tree.
 *
 * @example
 * ```ts
 * const tree = { root: ['a', 'b'], a: ['x', 'y'], b: [] };
 * Tree.containerKeys(tree); // Set { 'a', 'b' }
 * ```
 */
export function containerKeys<K extends string>(tree: Tree<K>, isContainer?: (key: K) => boolean): Set<K> {
  const check = isContainer ?? ((key: K) => key in tree);
  const result = new Set<K>();

  function walk(ids: K[]) {
    for (const id of ids) {
      if (check(id)) {
        result.add(id);
        walk(tree[id] ?? []);
      }
    }
  }

  walk(tree['root' as K] ?? []);
  return result;
}

// ============================================================================
// MARK: buildContainers
// ============================================================================

/**
 * Options for {@link buildContainers}.
 */
export type BuildContainersOptions<K extends string> = {
  /** Predicate: which keys are containers (have children). */
  isContainer: (key: K) => boolean;
  /** Measure an item's bounding rect by key. */
  getItemRect: (key: K) => Rect | undefined;
  /** Measure a container's bounding rect by its key. */
  getContainerRect: (key: K) => Rect | undefined;
  /** Optional: tags a container accepts. `undefined` = accept all. */
  getAcceptTags?: (containerKey: K) => string[] | undefined;
};

/**
 * Build the `NestableContainer[]` array from a tree structure.
 *
 * This bridges the gap between a declarative tree model and the
 * `createNestable` primitive which requires an explicit container array.
 *
 * Includes the root container (key: `'root'`) plus one container per
 * container-key found via {@link containerKeys}.
 *
 * @example
 * ```ts
 * const containers = Tree.buildContainers(tree(), {
 *   isContainer: (id) => NODES[id]?.isGroup ?? false,
 *   getItemRect: (key) => Rect.fromElement(itemRefs.get(key)),
 *   getContainerRect: (key) => Rect.fromElement(containerRefs.get(key)),
 * });
 * ```
 */
export function buildContainers<K extends string>(
  tree: Tree<K>,
  options: BuildContainersOptions<K>
): NestableContainer<K>[] {
  const groups = containerKeys(tree, options.isContainer);

  const result: NestableContainer<K>[] = [
    {
      key: 'root' as K,
      items: () => tree['root' as K] ?? [],
      acceptTags: options.getAcceptTags?.('root' as K),
      getRect: (key) => options.getItemRect(key),
      getContainerRect: () => options.getContainerRect('root' as K)
    }
  ];

  for (const groupId of groups) {
    result.push({
      key: groupId,
      items: () => tree[groupId] ?? [],
      acceptTags: options.getAcceptTags?.(groupId),
      getRect: (key) => options.getItemRect(key),
      getContainerRect: () => options.getContainerRect(groupId)
    });
  }

  return result;
}
