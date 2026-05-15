import { access, type MaybeAccessor } from '@solid-primitives/utils';
import { createMemo } from 'solid-js';
import { computeDisplayKeys, computeTreeDisplayKeys } from '../core/displayList';
import type { Place } from '../core/place';
import type { GapKey } from './createGapState';

export type DisplayListOptions<K> = Parameters<typeof createDisplayList<K>>[0];
export type DisplayList<K> = ReturnType<typeof createDisplayList<K>>;

// MARK: createDisplayList (flat list)

/**
 * Manages a display key list for a flat sortable container with live gap support.
 *
 * Dragged items are removed from the display list. Use with
 * `createDragSensor({ proxyCapture: true })` so the source element's removal
 * from the DOM doesn't cancel the drag. A gap key (`GAP_KEY`) is inserted at
 * the current drop position.
 *
 * @example
 * ```tsx
 * const display = createDisplayList<string>({
 *   keys: () => items().map(i => i.id),
 *   draggedKeys: () => draggedIds(),
 *   place: () => dropPlace(),
 *   containerKey: 'list',
 * });
 *
 * <For each={display.displayKeys()}>
 *   {(key) => {
 *     if (key === GAP_KEY) return <GapPlaceholder />;
 *     const item = () => items().find(i => i.id === key)!;
 *     return <ItemComponent item={item()} isDragged={display.isDragged(key)} />;
 *   }}
 * </For>
 * ```
 */
export function createDisplayList<K>(options: {
  /** Ordered item keys. */
  keys: MaybeAccessor<ReadonlyArray<K>>;
  /** Keys currently being dragged. */
  draggedKeys: MaybeAccessor<ReadonlySet<Exclude<K, GapKey>> | ReadonlyArray<Exclude<K, GapKey>>>;
  /** Current insertion point (where the gap should appear), or `undefined`. */
  place: MaybeAccessor<Place<K> | undefined>;
  /** The container key to match against `place.parent`. */
  containerKey: K | string;
}) {
  function getDraggedKeySet(): ReadonlySet<Exclude<K, GapKey>> {
    const draggedKeys = access(options.draggedKeys);
    return draggedKeys instanceof Set ? draggedKeys : new Set(draggedKeys);
  }

  const displayKeys = createMemo<ReadonlyArray<K | GapKey>>(() =>
    computeDisplayKeys(access(options.keys), getDraggedKeySet(), access(options.place), options.containerKey)
  );

  function isDragged(key: Exclude<K, GapKey>): boolean {
    return getDraggedKeySet().has(key);
  }

  return {
    /**
     * Display key list: non-dragged item keys in order, with a gap key inserted
     * at the drop position. Dragged items are removed from the list.
     *
     * Use with `<For each={displayKeys()}>` and `createDragSensor({ proxyCapture: true })`
     * so the source element's removal from the DOM doesn't cancel the drag.
     */
    displayKeys,
    /** Whether the given key is currently being dragged. */
    isDragged
  };
}

export type TreeDisplayListOptions<K extends string> = Parameters<typeof createTreeDisplayList<K>>[0];
export type TreeDisplayList<K extends string> = ReturnType<typeof createTreeDisplayList<K>>;

// MARK: createTreeDisplayList

/**
 * Manages display key lists for all containers in a tree with live gap support.
 *
 * This is the tree/nested equivalent of {@link createDisplayList}. Instead of
 * a single display key list, it provides per-container lists via
 * `getDisplayKeys(containerKey)`.
 *
 * @example
 * ```tsx
 * const display = createTreeDisplayList<string>({
 *   tree: () => tree(),
 *   draggedKeys: () => draggedId() ? [draggedId()!] : [],
 *   place: () => dropPlace(),
 * });
 *
 * function renderContainer(parentKey: string) {
 *   return (
 *     <For each={display.getDisplayKeys(parentKey)}>
 *       {(key) => {
 *         if (key === GAP_KEY) return <GapPlaceholder />;
 *         return <NodeComponent id={key} isDragged={display.isDragged(key)} />;
 *       }}
 *     </For>
 *   );
 * }
 * ```
 */
export function createTreeDisplayList<K extends string>(options: {
  /** Tree structure: containerKey → ordered child keys. */
  tree: MaybeAccessor<Readonly<Record<K | 'root', ReadonlyArray<K>>>>;
  /** Keys currently being dragged. */
  draggedKeys: MaybeAccessor<ReadonlySet<Exclude<K, GapKey>> | ReadonlyArray<Exclude<K, GapKey>>>;
  /** Current insertion point (where the gap should appear), or `undefined`. */
  place: MaybeAccessor<Place<K> | undefined>;
}) {
  function getTree(): Readonly<Record<K | 'root', ReadonlyArray<K>>> {
    return access(options.tree) as Readonly<Record<K | 'root', ReadonlyArray<K>>>;
  }

  function getDraggedKeySet(): ReadonlySet<Exclude<K, GapKey>> {
    const draggedKeys = access(options.draggedKeys);
    return draggedKeys instanceof Set ? draggedKeys : new Set(draggedKeys);
  }

  const allDisplayKeys = createMemo(() => computeTreeDisplayKeys(getTree(), getDraggedKeySet(), access(options.place)));

  function getDisplayKeys(containerKey: K | 'root'): ReadonlyArray<K | GapKey> {
    return allDisplayKeys()[containerKey as string] ?? [];
  }

  function isDragged(key: K): boolean {
    return getDraggedKeySet().has(key);
  }

  return {
    /** Get the display keys for a specific container. */
    getDisplayKeys,
    /** Whether the given key is currently being dragged. */
    isDragged
  };
}
