/**
 * Checks whether a container accepts items with the given drag tags.
 *
 * Rules:
 * - If the container has no `accepts` list, it accepts everything.
 * - If the container has an `accepts` list, at least one drag tag must match.
 * - If the dragged item has no tags, it is accepted only by containers with no `accepts` list.
 */
export function accepts(containerAccepts: string[] | undefined, dragTags: string[] | undefined): boolean {
  // No constraint → accept everything
  if (!containerAccepts || containerAccepts.length === 0) return true;
  // Container has constraints but item has no tags → reject
  if (!dragTags || dragTags.length === 0) return false;
  // At least one tag must match
  return dragTags.some((tag) => containerAccepts.includes(tag));
}

/**
 * Checks whether moving `movedKey` into `targetKey` would create a cycle.
 *
 * A cycle occurs when the target container is a descendant of the moved item
 * (i.e., you'd be dragging a parent into its own child).
 *
 * @param movedKey    The key being dragged.
 * @param targetKey   The container key we want to drop into.
 * @param getParent   Returns the parent key of a given key, or `undefined` for root.
 */
export function wouldCycle<K>(movedKey: K, targetKey: K, getParent: (key: K) => K | undefined): boolean {
  // Walk up from targetKey. If we ever reach movedKey, it's a cycle.
  const visited = new Set<K>();
  let current: K | undefined = targetKey;
  while (current !== undefined) {
    if (current === movedKey) return true;
    if (visited.has(current)) return false; // malformed parent chain — break
    visited.add(current);
    current = getParent(current);
  }
  return false;
}
