// ============================================================================
// Place — Universal insertion coordinate
// ============================================================================

/**
 * Describes a position in a container where items can be inserted.
 *
 * @example
 *   { parent: 'folder-1', before: 'item-3' }  // Insert before item-3 in folder-1
 *   { parent: 'folder-1', before: null }       // Append at end of folder-1
 */
export type Place<K> = {
  /** The key of the container to insert into. */
  parent: K;
  /** The key of the item to insert before, or `null` to append at the end. */
  before: K | null;
};

/**
 * Structural equality check for two Place values.
 * Returns `true` if both are the same reference, both undefined, or have
 * identical `parent` and `before` fields.
 *
 * Useful as a SolidJS signal `equals` option to prevent redundant updates
 * when the logical insertion point hasn't changed.
 *
 * @example
 *   const [place, setPlace] = createSignal(undefined, { equals: Place.equals });
 */
export function equals<K>(a: Place<K> | undefined, b: Place<K> | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.parent === b.parent && a.before === b.before;
}

/**
 * Human-readable label for a Place, useful for debugging and display.
 *
 * @example
 *   label({ parent: 'list', before: 'b' }) // 'before "b"'
 *   label({ parent: 'list', before: null }) // 'append'
 *   label(undefined)                        // 'none'
 */
export function label<K>(place: Place<K> | undefined): string {
  if (!place) return 'none';
  return place.before !== null ? `before "${place.before}"` : 'append';
}
