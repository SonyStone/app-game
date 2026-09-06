import { type Accessor, createMemo } from 'solid-js';
import { computeDisplayKeys, computeTreeDisplayKeys, type GapKey } from '../core/displayList';
import type { Place } from '../core/place';

export type DropzoneOptions<K> = Parameters<typeof createDropzone<K>>[0];
export type Dropzone<K> = ReturnType<typeof createDropzone<K>>;

// MARK: createDropzone (flat list)

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
 * const dropzone = createDropzone<string>({
 *   keys: () => items().map(i => i.id),
 *   draggedKeys: () => draggedIds(),
 *   place: () => dropPlace(),
 *   containerKey: 'list',
 * });
 *
 * <For each={dropzone.displayKeys()}>
 *   {(key) => {
 *     if (key === GAP_KEY) return <GapPlaceholder />;
 *     const item = () => items().find(i => i.id === key)!;
 *     return <ItemComponent item={item()} isDragged={dropzone.isDragged(key)} />;
 *   }}
 * </For>
 * ```
 */
export function createDropzone<K>(options: {
  /** Ordered item keys. */
  keys: Accessor<ReadonlyArray<K>>;
  /** Keys currently being dragged. */
  draggedKeys: Accessor<ReadonlyArray<Exclude<K, GapKey>>>;
  /** Current insertion point (where the gap should appear), or `undefined`. */
  place: Accessor<Place<K> | undefined>;
  /** The container key to match against `place.parent`. */
  containerKey: K | string;
}) {
  const draggedSet = createMemo(() => new Set(options.draggedKeys()));

  const displayKeys = createMemo(() =>
    computeDisplayKeys(options.keys(), draggedSet(), options.place(), options.containerKey)
  );

  function isDragged(key: Exclude<K, GapKey>): boolean {
    return draggedSet().has(key);
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

export type TreeDropzoneOptions<K extends string> = Parameters<typeof createTreeDropzone<K>>[0];
export type TreeDropzone<K extends string> = ReturnType<typeof createTreeDropzone<K>>;

// MARK: createTreeDropzone

/**
 * Manages display key lists for all containers in a tree with live gap support.
 *
 * This is the tree/nested equivalent of {@link createDropzone}. Instead of
 * a single display key list, it provides per-container lists via
 * `getDisplayKeys(containerKey)`.
 *
 * @example
 * ```tsx
 * const dropzone = createTreeDropzone<string>({
 *   tree: () => tree(),
 *   draggedKeys: () => draggedId() ? [draggedId()!] : [],
 *   place: () => dropPlace(),
 * });
 *
 * function renderContainer(parentKey: string) {
 *   return (
 *     <For each={dropzone.getDisplayKeys(parentKey)}>
 *       {(key) => {
 *         if (key === GAP_KEY) return <GapPlaceholder />;
 *         return <NodeComponent id={key} isDragged={dropzone.isDragged(key)} />;
 *       }}
 *     </For>
 *   );
 * }
 * ```
 */
export function createTreeDropzone<K extends string>(options: {
  /** Tree structure: containerKey → ordered child keys. */
  tree: Accessor<Record<K | 'root', K[]>>;
  /** Keys currently being dragged. */
  draggedKeys: Accessor<ReadonlyArray<Exclude<K, GapKey>>>;
  /** Current insertion point (where the gap should appear), or `undefined`. */
  place: Accessor<Place<K> | undefined>;
}) {
  const draggedSet = createMemo(() => new Set(options.draggedKeys()));

  const allDisplayKeys = createMemo(() => computeTreeDisplayKeys(options.tree(), draggedSet(), options.place()));

  function getDisplayKeys(containerKey: K | 'root'): (K | GapKey)[] {
    return allDisplayKeys()[containerKey as string] ?? [];
  }

  function isDragged(key: K): boolean {
    return draggedSet().has(key);
  }

  return {
    /** Get the display keys for a specific container. */
    getDisplayKeys,
    /** Whether the given key is currently being dragged. */
    isDragged
  };
}
