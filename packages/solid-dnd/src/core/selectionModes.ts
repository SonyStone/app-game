// MARK: Types

/** How a selection click should be interpreted. */
export type SelectionMode = 'set' | 'toggle' | 'range';

// MARK: getSelectionMode

/**
 * Determines the selection mode from modifier keys on a pointer event.
 *
 * - **Ctrl/Cmd + click** → `'toggle'` (add/remove single item)
 * - **Shift + click** → `'range'` (select contiguous range)
 * - **Plain click** → `'set'` (replace selection with single item)
 *
 * On macOS, `metaKey` (⌘) is the multi-select modifier.
 * On Windows/Linux, `ctrlKey` is the multi-select modifier.
 * This function treats both the same.
 */
export function getSelectionMode(ev: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }): SelectionMode {
  if (ev.shiftKey) return 'range';
  if (ev.ctrlKey || ev.metaKey) return 'toggle';
  return 'set';
}

// MARK: applySet

/**
 * **Set mode**: Replace the entire selection with a single key.
 *
 * @returns New selection array containing only `key`.
 */
export function applySet<K>(key: K): K[] {
  return [key];
}

// MARK: applyToggle

/**
 * **Toggle mode**: Add `key` if not selected, remove it if already selected.
 * Preserves the order of previously selected keys.
 *
 * @param selected Current selection.
 * @param key The key to toggle.
 * @returns New selection array.
 */
export function applyToggle<K>(selected: K[], key: K): K[] {
  const idx = selected.indexOf(key);
  if (idx >= 0) {
    // Remove — return a copy without the key
    return [...selected.slice(0, idx), ...selected.slice(idx + 1)];
  }
  // Add at end
  return [...selected, key];
}

// MARK: applyRange

/**
 * **Range mode**: Select a contiguous range from `anchor` to `key` (inclusive),
 * using the order defined by `items`.
 *
 * If the anchor is not in `items`, falls back to set mode (selects only `key`).
 * The returned array follows the `items` order (not the selection direction).
 *
 * @param items The full ordered list of item keys.
 * @param anchor The key that started the range (usually the first selected item or last anchor).
 * @param key The key that ends the range (the shift-clicked item).
 * @returns New selection array covering the range.
 */
export function applyRange<K>(items: ReadonlyArray<K>, anchor: K, key: K): K[] {
  const anchorIdx = items.indexOf(anchor);
  const keyIdx = items.indexOf(key);

  if (anchorIdx === -1 || keyIdx === -1) {
    // Fallback: one or both keys not found
    return [key];
  }

  const start = Math.min(anchorIdx, keyIdx);
  const end = Math.max(anchorIdx, keyIdx);
  return items.slice(start, end + 1);
}

// MARK: applyGridRange

/**
 * **Grid range mode**: Select a rectangular region from `anchor` to `key`.
 *
 * Unlike `applyRange` which selects a linear slice, this selects all items
 * within the rectangular bounding box defined by the two cells in the grid.
 *
 * @param items   The full ordered list of item keys.
 * @param anchor  The key that started the range (anchor cell).
 * @param key     The key at the end of the range (shift-clicked cell).
 * @param columns Number of columns in the grid.
 * @returns New selection array covering the rectangular region, in items order.
 */
export function applyGridRange<K>(items: ReadonlyArray<K>, anchor: K, key: K, columns: number): K[] {
  const anchorIdx = items.indexOf(anchor);
  const keyIdx = items.indexOf(key);

  if (anchorIdx === -1 || keyIdx === -1) {
    return [key];
  }

  const anchorRow = Math.floor(anchorIdx / columns);
  const anchorCol = anchorIdx % columns;
  const keyRow = Math.floor(keyIdx / columns);
  const keyCol = keyIdx % columns;

  const minRow = Math.min(anchorRow, keyRow);
  const maxRow = Math.max(anchorRow, keyRow);
  const minCol = Math.min(anchorCol, keyCol);
  const maxCol = Math.max(anchorCol, keyCol);

  const result: K[] = [];
  for (let r = minRow; r <= maxRow; r++) {
    for (let c = minCol; c <= maxCol; c++) {
      const idx = r * columns + c;
      if (idx < items.length) {
        result.push(items[idx]);
      }
    }
  }
  return result;
}
