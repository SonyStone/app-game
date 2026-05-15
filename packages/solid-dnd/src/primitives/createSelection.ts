import { access, type MaybeAccessor } from '@solid-primitives/utils';
import { createMemo, createSignal } from 'solid-js';
import { GapKey, isGapKey } from '..';
import {
  applyGridRange,
  applyRange,
  applySet,
  applyToggle,
  getSelectionMode,
  type SelectionMode
} from '../core/selectionModes';

export type SelectionOptions<K> = Parameters<typeof createSelection<K>>[0];
export type Selection<K> = ReturnType<typeof createSelection<K>>;

/**
 * A primitive for multi-select in an ordered list of items.
 *
 * ## Selection modes
 *
 * | Modifier          | Mode     | Behavior                                  |
 * |-------------------|----------|-------------------------------------------|
 * | (none)            | `set`    | Replace selection with clicked item       |
 * | Ctrl / ⌘          | `toggle` | Add or remove clicked item                |
 * | Shift             | `range`  | Select contiguous range from anchor       |
 *
 * When `multiselect` is `false`, modifier keys are ignored and all clicks
 * use `set` mode.
 *
 * ## Anchor
 *
 * The **anchor** is the key from which Shift+click ranges are computed.
 * It's updated on every `set` or `toggle` click, but NOT during `range`
 * clicks (so you can Shift+click multiple times to adjust the range end
 * without moving the anchor).
 *
 * @example
 * ```tsx
 * const selection = createSelection({ items: () => itemKeys });
 *
 * <For each={items()}>
 *   {(item) => (
 *     <div
 *       class={selection.isSelected(item.id) ? 'selected' : ''}
 *       onClick={(ev) => selection.handleClick(item.id, ev)}
 *     >
 *       {item.label}
 *     </div>
 *   )}
 * </For>
 * ```
 */
export function createSelection<K>(options: {
  /** The ordered list of selectable items. */
  items: MaybeAccessor<ReadonlyArray<K>>;
  /**
   * Whether multi-selection (toggle / range) is enabled.
   * When `false`, modifier keys are ignored and clicks always use set mode.
   * @default true
   */
  multiselect?: MaybeAccessor<boolean>;
  /**
   * Grid columns for rectangular range selection.
   * When set, Shift+click selects a rectangular region instead of a linear range.
   * When `undefined`, Shift+click selects a linear range (default list behavior).
   */
  gridColumns?: MaybeAccessor<number | undefined>;
  /** Called whenever the selection changes. */
  onSelectionChange?: (keys: ReadonlyArray<K>) => void;
}) {
  const [selected, setSelected] = createSignal<Exclude<K, GapKey>[]>([]);

  const [anchor, setAnchor] = createSignal<K | null>(null);

  // Fast lookup set, derived from selected()
  const selectedSet = createMemo(() => new Set(selected()));

  function isSelected(key: Exclude<K, GapKey>): boolean {
    return selectedSet().has(key);
  }

  function getMode(ev: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }): SelectionMode {
    if (access(options.multiselect) === false) return 'set';
    return getSelectionMode(ev);
  }

  function updateSelection(keys: ReadonlyArray<K>): void {
    setSelected(keys.filter((k): k is Exclude<K, GapKey> => (isGapKey(k) ? false : true)));
    options.onSelectionChange?.(keys);
  }

  function handleClick(key: K, ev: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }): void {
    const mode = getMode(ev);

    switch (mode) {
      case 'set': {
        updateSelection(applySet(key));
        setAnchor(() => key);
        break;
      }
      case 'toggle': {
        updateSelection(applyToggle(selected(), key));
        setAnchor(() => key);
        break;
      }
      case 'range': {
        const a = anchor();
        if (a === null) {
          // No anchor yet — treat as set
          updateSelection(applySet(key));
          setAnchor(() => key);
        } else {
          const cols = access(options.gridColumns);
          if (cols !== undefined && cols > 0) {
            updateSelection(applyGridRange(access(options.items), a, key, cols));
          } else {
            updateSelection(applyRange(access(options.items), a, key));
          }
          // Don't update anchor on range — user can shift-click again to adjust
        }
        break;
      }
    }
  }

  function select(keys: ReadonlyArray<K>): void {
    updateSelection(keys);
    setAnchor(() => (keys.length > 0 ? keys[0]! : null));
  }

  function clear(): void {
    updateSelection([]);
    setAnchor(null);
  }

  return {
    /** The currently selected keys, in selection order. */
    selected,
    /** Reactive lookup — whether a specific key is currently selected. */
    isSelected,
    /**
     * Handle a click/tap on an item. Reads modifier keys to determine mode.
     *
     * Use this for the `onClick` / `onPointerUp` after a non-drag gesture.
     * For already-selected items, this is the "commit" action that was
     * deferred from `handlePointerDown` to allow drag disambiguation.
     */
    handleClick,
    /**
     * Select specific keys programmatically (replaces current selection).
     * The anchor is set to the first key.
     */
    select,
    /** Clear the entire selection. */
    clear,
    /**
     * Get the selection mode that would be used for a given event.
     * Useful for UI indicators ("Shift = range", "Ctrl = toggle").
     */
    getMode,
    /** The current range anchor key, or `null` if no anchor is set. */
    anchor
  };
}
