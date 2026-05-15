import { access, type MaybeAccessor } from '@solid-primitives/utils';
import { batch, createEffect, createMemo, createSignal, mapArray, on, onCleanup, type Accessor } from 'solid-js';
import * as Place from '../core/place';
import { fromElement } from '../core/rect';
import type { GridConfig, LayoutMode } from '../core/types';
import type { Vec2 } from '../core/vec2';
import { createDetectLayout } from '../primitives/createDetectLayout';
import { createDisplayList } from '../primitives/createDisplayList';
import { createDragOverlay } from '../primitives/createDragOverlay';
import { createDragSensor } from '../primitives/createDragSensor';
import { createFlip, type FlipAnimateEntry } from '../primitives/createFlip';
import { GAP_KEY, createGapState, isGapKey, type GapKey } from '../primitives/createGapState';
import { createSelection, type Selection } from '../primitives/createSelection';
import { createSortable } from '../primitives/createSortable';

export type DndOptions<TItem extends object, K extends string> = Parameters<typeof createDnd<TItem, K>>[0];
export type Dnd<TItem extends object, K extends string> = ReturnType<typeof createDnd<TItem, K>>;

/**
 * High-level DOM-oriented sortable DnD setup.
 *
 * `createDnd` is the convenience composition layer for the common case where
 * you already have real DOM elements and want selection, overlay, FLIP, and
 * sortable insertion logic wired together.
 *
 * Compared to `createSortable`, this composite is intentionally less generic:
 * it works from a container element, derives the container rect internally,
 * and can auto-detect vertical, horizontal, or grid layout from computed CSS.
 *
 * Use `createSortable` directly when you want the lower-level geometry-first
 * API and prefer to supply rects yourself.
 */
export function createDnd<TItem extends object, K extends string>(options: {
  /** Current ordered items. */
  items: Accessor<TItem[]>;
  /** Extracts the stable item key. */
  getKey: (item: TItem) => K;
  /** Container element used for layout auto-detection and measurement. */
  getContainerElement: () => HTMLElement | undefined;
  /** Container key used for insertion places. */
  containerKey: K;
  /** Layout override for sortable insertion. Auto-detected from the container when omitted. */
  layout?: MaybeAccessor<LayoutMode>;
  /** Grid config override used when layout is `'grid'`. Auto-detected from the container when omitted. */
  gridConfig?: MaybeAccessor<GridConfig | undefined>;
  /** Grid column override for rectangular shift-selection. Auto-detected from the container when omitted. */
  gridColumns?: MaybeAccessor<number | undefined>;
  /** Whether multiselect behavior is enabled. */
  multiselect?: MaybeAccessor<boolean>;
  /** Drag threshold in pixels. */
  threshold?: MaybeAccessor<number>;
  /** FLIP animation duration in ms. */
  duration?: MaybeAccessor<number>;
  /** FLIP easing function. */
  easing?: MaybeAccessor<string>;
  /** Whether FLIP animations are enabled. */
  animEnabled?: MaybeAccessor<boolean>;
  /** Called before resolving dragged keys and snapshotting sortable rects. */
  prepareDragStart?: (key: K) => void;
  /** Resolves which keys should be dragged when a drag starts from `key`. */
  resolveDraggedKeys?: (key: K, context: { selection: Selection<K> }) => ReadonlyArray<K>;
  /** Called when selection changes. */
  onSelectionChange?: (keys: ReadonlyArray<K>) => void;
  /** Called when a drag starts. */
  onDragStart?: (keys: ReadonlyArray<K>, position: Vec2) => void;
  /** Applies the drop result. */
  onDrop: (keys: ReadonlyArray<K>, place: Place.Place<K>) => void;
  /** Called when drag is cancelled. */
  onCancel?: () => void;
  /** Called with FLIP animation entries. */
  onFlipAnimate?: (entries: ReadonlyArray<FlipAnimateEntry<K | GapKey>>) => void;
}) {
  const itemKeys = createMemo(() => options.items().map((item) => options.getKey(item)));
  const itemMap = createMemo(() => {
    const map = new Map<K, TItem>();
    for (const item of options.items()) {
      map.set(options.getKey(item), item);
    }
    return map;
  });
  const itemRefs = new Map<K, HTMLElement>();
  const gap = createGapState();

  const [dropPlace, setDropPlace] = createSignal<Place.Place<K> | undefined>(undefined, {
    equals: Place.equals
  });

  const [draggedIds, setDraggedIds] = createSignal<ReadonlyArray<K>>([]);
  const draggedItems = Object.assign(
    createMemo<ReadonlyArray<TItem>>(() => {
      const map = itemMap();
      return draggedIds()
        .map((key) => map.get(key))
        .filter((item): item is TItem => item !== undefined);
    }),
    {
      keys: draggedIds
    }
  );
  const dragOverlay = createDragOverlay({
    currentPosition: () => sensor.position() ?? { x: 0, y: 0 }
  });
  const overlay = createMemo(() => (dragOverlay.active() ? dragOverlay.rect : undefined));

  const layoutDetection = createDetectLayout(options.getContainerElement);

  const resolvedLayout = createMemo<LayoutMode>(() => access(options.layout) ?? layoutDetection.detectedLayout().mode);
  const resolvedGridConfig = createMemo<GridConfig | undefined>(() => {
    const gridConfig = access(options.gridConfig);
    if (gridConfig) {
      return gridConfig;
    }

    const layout = layoutDetection.detectedLayout();
    return layout.mode === 'grid' ? layout.gridConfig : undefined;
  });
  const resolvedGridColumns = createMemo<number | undefined>(() => {
    const gridColumns = access(options.gridColumns);
    if (gridColumns !== undefined) {
      return gridColumns;
    }

    return layoutDetection.detectedColumns();
  });

  const selection = createSelection<K>({
    items: itemKeys,
    multiselect: options.multiselect,
    gridColumns: resolvedGridColumns,
    onSelectionChange: options.onSelectionChange
  });

  function getContainerRect() {
    return fromElement(options.getContainerElement());
  }

  const sortable = createSortable<K>({
    containerKey: options.containerKey,
    items: itemKeys,
    layout: resolvedLayout,
    get gridConfig() {
      return resolvedGridConfig();
    },
    draggedKeys: draggedIds,
    getRect: (key) => {
      const element = itemRefs.get(key);
      return element?.getBoundingClientRect();
    },
    getHitRect: getContainerRect,
    getContainerRect
  });

  const isAnimEnabled = (): boolean => access(options.animEnabled) ?? true;
  const duration = createMemo(() => (isAnimEnabled() ? (access(options.duration) ?? 300) : 0));

  const flip = createFlip<K | GapKey>({
    keys: createMemo<ReadonlyArray<K | GapKey>>(() => {
      const keys: (K | GapKey)[] = [...itemKeys()];
      if (gap.element()) {
        keys.push(GAP_KEY);
      }
      return keys;
    }),
    getElement: (key) => (isGapKey(key) ? gap.element() : itemRefs.get(key)),
    duration,
    easing: options.easing,
    onAnimate: options.onFlipAnimate
  });

  let pendingDragKey: K | null = null;
  let pendingDragElement: HTMLElement | null = null;
  let moveSwallowed = false;

  const sensor = createDragSensor({
    threshold: options.threshold ?? 5,
    proxyCapture: true,
    onClick: (event) => {
      const key = pendingDragKey;
      pendingDragKey = null;
      pendingDragElement = null;
      if (key !== null && key !== undefined) {
        selection.handleClick(key, event);
      }
    },
    onDragStart: (event) => {
      const key = pendingDragKey;
      if (key === null) {
        return;
      }

      const sourceElement = itemRefs.get(key) ?? pendingDragElement;
      if (sourceElement) {
        gap.setSizeFromElement(sourceElement);
        dragOverlay.start(sourceElement, event.position);
      }

      options.prepareDragStart?.(key);

      const keys = options.resolveDraggedKeys?.(key, { selection }) ?? defaultDraggedKeys(key, selection);
      sortable.snapshotRects(keys);

      if (isAnimEnabled()) {
        flip.captureFirst();
      }

      batch(() => {
        setDraggedIds(keys);
        updateDropPlace(insertionPosition() ?? event.position);
      });

      options.onDragStart?.(keys, event.position);
    },
    onDragMove: () => {
      if (flip.isAnimating()) {
        moveSwallowed = true;
        return;
      }

      moveSwallowed = false;
      if (isAnimEnabled()) {
        flip.captureFirst();
      }

      updateDropPlace(insertionPosition());
    },
    onDragEnd: () => {
      if (moveSwallowed) {
        moveSwallowed = false;
        updateDropPlace(insertionPosition());
      }

      const place = dropPlace();
      const keys = draggedIds();
      if (!place || keys.length === 0) {
        flip.animate(() => resetDragState());
        return;
      }

      flip.animate(() => {
        options.onDrop(keys, place);
        resetDragState();
      });
    },
    onDragCancel: () => {
      options.onCancel?.();
      flip.animate(() => resetDragState());
    }
  });

  const elements = createMemo(() => {
    const all = new Map<K | GapKey, HTMLElement>(itemRefs);
    const gapElement = gap.element();
    if (gapElement) {
      all.set(GAP_KEY, gapElement);
    }
    return all;
  });

  const display = createDisplayList<K>({
    keys: itemKeys,
    draggedKeys: draggedIds,
    place: dropPlace,
    containerKey: options.containerKey
  });
  createEffect(
    on(
      () => display.displayKeys(),
      () => {
        if (sensor.isDragging() && isAnimEnabled()) {
          flip.playFromFirst();
        }
      },
      { defer: true }
    )
  );

  createEffect(
    on(
      () => flip.isAnimating(),
      (animating) => {
        if (!animating && moveSwallowed && sensor.isDragging()) {
          const position = insertionPosition();
          if (!position) {
            return;
          }

          moveSwallowed = false;
          flip.captureFirst();
          updateDropPlace(position);
        }
      }
    )
  );

  function defaultDraggedKeys(key: K, currentSelection: Selection<K>): ReadonlyArray<K> {
    return currentSelection.isSelected(key) ? currentSelection.selected() : [key];
  }

  function insertionPosition(): Vec2 | undefined {
    if (dragOverlay.active()) {
      const { x, y, width, height } = dragOverlay.rect;
      return { x: x + width / 2, y: y + height / 2 };
    }

    return sensor.position() ?? undefined;
  }

  function updateDropPlace(position?: Vec2): void {
    if (!position) {
      return;
    }

    setDropPlace(sortable.getInsertionPoint(position));
  }

  function resetDragState(): void {
    pendingDragKey = null;
    moveSwallowed = false;
    setDraggedIds([]);
    setDropPlace(undefined);
    gap.resetSize();
    dragOverlay.stop();
    sortable.clearSnapshot();
  }

  function onPointerDown(key: K, event: PointerEvent): void {
    pendingDragKey = key;
    sensor.onPointerDown(event);
  }

  function getElement(key: K | GapKey): HTMLElement | undefined {
    return isGapKey(key) ? gap.element() : itemRefs.get(key);
  }

  function getItem(key: K): TItem | undefined {
    return itemMap().get(key);
  }

  function getItemBindings(key: K) {
    return {
      gap: false,
      ref(element: HTMLElement) {
        itemRefs.set(key, element);
        onCleanup(() => {
          itemRefs.delete(key);
        });
      },
      key: key,
      get item() {
        return getItem(key)!;
      },
      get isDragged() {
        return display.isDragged(key) && sensor.isDragging();
      },
      get isSelected() {
        return selection.isSelected(key);
      },
      onPointerDown(event: PointerEvent) {
        onPointerDown(key, event);
      }
    } as const;
  }

  function getGapBindings() {
    return {
      gap: true,
      ref(element: HTMLElement): void {
        gap.setRef(element);
      },
      get height() {
        return gap.height();
      },
      get width() {
        return gap.width();
      }
    } as const;
  }

  return {
    displayItems: Object.assign(
      mapArray(display.displayKeys, (key) => (isGapKey(key) ? getGapBindings() : getItemBindings(key))),
      {
        keys: display.displayKeys
      }
    ),
    selectedItems: Object.assign(
      createMemo(() => {
        const map = itemMap();
        return selection
          .selected()
          .map((key) => map.get(key))
          .filter((item): item is TItem => item !== undefined);
      }),
      {
        clear: () => selection.clear(),
        keys: selection.selected
      }
    ),
    itemKeys,
    elements,
    itemRefs,
    getItem,
    getElement,
    detectedLayout: layoutDetection.detectedLayout,
    detectedColumns: resolvedGridColumns,
    selection,
    sortable,
    display,
    drag: {
      sensor,
      overlay,
      flip,
      isDragging: sensor.isDragging,
      draggedItems,
      dropPlace,
      gapHeight: gap.height,
      gapWidth: gap.width,
      onPointerDown
    },
    isDragging: sensor.isDragging,
    isAnimating: flip.isAnimating,
    getItemBindings,
    getGapBindings
  };
}
