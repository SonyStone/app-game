import type { JSX } from '@solidjs/web';
import { Dynamic } from '@solidjs/web';
import type { Accessor, Component } from 'solid-js';
import { createMemo, createTrackedEffect, For, onCleanup, onSettled, Show, untrack } from 'solid-js';
import { BlockItem, Item, ItemId } from './Item';
import { AnimationState, innerStyle, outerStyle, placeholderStyle, spacerStyle } from './calculateTransitionStyles';
import { DragContainer, DragContainerProps } from './components/DragContainer';
import { Dropzone } from './components/Dropzone';
import { Placeholder } from './components/Placeholder';
import { createAnimations } from './createAnimations';
import { createDnd } from './dnd/createDnd';
import {
  CopyEvent,
  CutEvent,
  EventHandler,
  InsertEvent,
  PasteEvent,
  Place,
  RemoveEvent,
  ReorderEvent,
  SelectionEvent
} from './events';
import { calculateSelectionMode, normaliseSelection, updateSelection } from './selection';
import { blockClass, spacerClass, spacingVar } from './styles';
import { notNull } from './util/notNull';
import { VirtualTree } from './virtual-tree';

export type BlockTreeProps<K, T> = {
  /** The root container. */
  root: Container<K, T>;
  /** Gets the key of a block. */
  getKey: (block: T) => K;
  /** Gets the configuration options for a block. */
  getOptions?: (block: T) => BlockOptions | null | undefined;
  /** Gets the configuration options for a block. */
  getContainers?: (block: T) => Container<K, T>[] | null | undefined;
  /**
   * The current selection, which can be either:
   * - A set of blocks, in the order they were selected
   * - An insertion point between blocks
   */
  selection?: Selection<K>;
  /** Fired when a block is selected or deselected. */
  onSelectionChange?: (event: SelectionEvent<K>) => void;
  /** Fired when blocks are inserted. */
  onInsert?: EventHandler<InsertEvent<K, T>>;
  /** Fired when blocks are reordered. */
  onReorder?: EventHandler<ReorderEvent<K>>;
  /** Fired when blocks are removed. */
  onRemove?: EventHandler<RemoveEvent<K>>;
  /** Fired when blocks are copied. */
  onCopy?: EventHandler<CopyEvent<T>>;
  /** Fired when blocks are cut. */
  onCut?: EventHandler<CutEvent<T>>;
  /** Fired when blocks are pasted. */
  onPaste?: EventHandler<PasteEvent<K>>;
  /**
   * Optional custom drop marker, stretched over a thin line between blocks or over a collapsed block
   * being dropped into. Its wrapper carries `data-drop="line"` or `data-drop="into"` for styling.
   */
  dropzone?: Component<{}>;
  /** Optional custom placeholder component. */
  placeholder?: Component<{ parent: K }>;
  /** Optional custom drag container component. */
  dragContainer?: Component<DragContainerProps<T>>;
  /** Duration of transition animations, in milliseconds. */
  transitionDuration?: number;
  /** Distance a mouse or pen must move, in pixels, for a drag to be detected; defaults to `10`. */
  dragThreshold?: number;
  /**
   * How long a touch must hold still, in milliseconds, before it drags instead of scrolling;
   * defaults to `350`. Blocks should use `touch-action: manipulation` (or `pan-y`) so touches can scroll.
   */
  touchDragDelay?: number;
  /**
   * Forces the container to maintain a fixed height while dragging is in progress;
   * useful for preventing odd behaviour when the component is inside a scrollable element.
   */
  fixedHeightWhileDragging?: boolean;
  /** Whether to allow mutliple blocks to be selected at once; defaults to `true`. */
  multiselect?: boolean;
  /** Component used to render blocks. */
  children: Component<BlockProps<K, T>>;
};

/** Configures how a block is rendered and interacts with other blocks. */
export type BlockOptions = {
  /**
   * The block's tag, used to determine which parent blocks it can be dragged into.
   * Blocks without a tag can be accepted by any parent.
   * */
  tag?: string;
};

export type Container<K, T> = {
  /** The container's unique key. */
  key: K;
  /** The spacing between child blocks, in pixels. */
  spacing?: number;
  /** The set of tags that this block accepts as children. */
  accepts?: string[];
  /** Layout mode: 'list' (vertical, default) or 'wrap' (flex-wrap grid). */
  layout?: 'list' | 'wrap';
  /** Gets the blocks in this container. */
  getBlocks: () => T[];
};

export type Selection<K> = { blocks?: K[]; place?: Place<K> };

export type BlockProps<K, T> = {
  key: K;
  block: T;
  selected: boolean;
  dragging: boolean;
  children: JSX.Element;
};

export function BlockTree<K, T>(props: BlockTreeProps<K, T>) {
  const itemElements = new Map<ItemId, HTMLElement>();
  let focusElement!: HTMLDivElement;

  onCleanup(() => itemElements.clear());

  const options = createMemo(() => ({
    transitionDuration: props.transitionDuration ?? 200,
    multiselect: props.multiselect ?? true,
    dragThreshold: props.dragThreshold ?? 10,
    touchDragDelay: props.touchDragDelay ?? 350
  }));

  const selectedBlocks = () => props.selection?.blocks ?? [];

  const selectedPlace = createMemo(() => {
    const selection = props.selection;
    if (selection?.place) {
      return selection.place;
    }
    if (selection?.blocks) {
      const keys = new Set(selection.blocks);
      const process = (container: Container<K, T>): Place<K> | undefined => {
        const parent = container.key;
        const blocks = container.getBlocks();

        let before: K | null = null;
        for (let i = blocks.length - 1; i >= 0; i--) {
          const block = blocks[i]!;
          const key = props.getKey(block);
          if (keys.has(key)) {
            return { parent, before };
          }
          const containers = props.getContainers?.(block) ?? [];
          for (const container of containers.toReversed()) {
            const result = process(container);
            if (result) return result;
          }
          before = key;
        }
        return undefined;
      };
      return process(props.root);
    }
  });

  const inputTree = VirtualTree.create<K, T>(
    () => props.root,
    (block) => props.getKey(block),
    (block) => props.getOptions?.(block) ?? {},
    (block) => props.getContainers?.(block) ?? []
  );

  const getBlock = (key: K) => inputTree().findBlock(key);

  const blocksToDrag = (key: K) => {
    const selection_ = selectedBlocks();
    return normaliseSelection(inputTree(), selection_.includes(key) ? selection_ : [key])
      .map((key) => getBlock(key))
      .filter(notNull);
  };

  const dnd = createDnd(inputTree, options, itemElements, blocksToDrag, (ev) => props.onReorder?.(ev));
  const { dragTree, dragState, dropTarget, dragPosition, onDragHandleDown } = dnd;

  const { tree, styles } = createAnimations(inputTree, itemElements, options);
  const draggedKeys = createMemo(() => new Set(dragState()?.keys));

  const containerHeight = createMemo(() => {
    if (dragState() != null && props.fixedHeightWhileDragging) {
      const root = itemElements.get(tree().root.id)!.getBoundingClientRect();
      return `${root.height}px`;
    } else {
      return 'auto';
    }
  });

  const dragContainerStyle = createMemo(() => {
    const rect = dragPosition();

    return {
      position: 'fixed' as const,
      left: '0',
      top: '0',
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      transform: `translate(${rect.x}px, ${rect.y}px)`,
      'z-index': 10000,
      'pointer-events': 'none' as const
    };
  });

  let rootElement!: HTMLDivElement;
  const dropMarkerStyle = createMemo(() => {
    const target = dropTarget();
    if (!target) return undefined;

    const origin = rootElement.getBoundingClientRect();
    const { x, y, width, height } = target.indicator;
    return {
      position: 'absolute' as const,
      left: `${x - origin.x}px`,
      top: `${y - origin.y}px`,
      width: `${width}px`,
      height: `${height}px`,
      'z-index': 50,
      'pointer-events': 'none' as const
    };
  });

  const handleDelete = (ev: KeyboardEvent) => {
    if (!selectedBlocks().length) return;

    ev.preventDefault();
    props.onRemove?.({ keys: selectedBlocks().slice() });
  };

  const handleKeyDown = (ev: KeyboardEvent) => {
    if (ev.key === 'Delete') {
      return handleDelete(ev);
    }
  };

  const handleCopy = (ev: ClipboardEvent) => {
    const keys = normaliseSelection(tree(), selectedBlocks());
    const data = ev.clipboardData;
    if (!keys.length || !data) return;

    ev.preventDefault();
    const blocks = keys.map((key) => getBlock(key)).filter(notNull);
    props.onCopy?.({ blocks, data });
  };

  const handleCut = (ev: ClipboardEvent) => {
    const keys = normaliseSelection(tree(), selectedBlocks());
    const data = ev.clipboardData;
    if (!keys.length || !data) return;

    ev.preventDefault();
    const blocks = keys.map((key) => getBlock(key)).filter(notNull);
    props.onCut?.({ blocks, data });
  };

  const handlePaste = (ev: ClipboardEvent) => {
    const place = selectedPlace();
    const data = ev.clipboardData;
    if (!place || !data) return;

    ev.preventDefault();
    props.onPaste?.({ place, data });
  };

  let removeClickHandler: (() => void) | undefined;

  onSettled(() => {
    const ondown = () => removeClickHandler?.();
    document.addEventListener('pointerdown', ondown, { capture: true });

    return () => document.removeEventListener('pointerdown', ondown, { capture: true });
  });

  const handlePointerDown = (item: BlockItem<K, T>) => (ev: PointerEvent) => {
    if (!ev.isPrimary) return;

    ev.preventDefault();
    ev.stopPropagation();

    const mode = calculateSelectionMode(ev, options().multiselect);
    const nextSelection = updateSelection(tree(), selectedBlocks(), item.key, mode);

    const select = () => {
      const { mode, keys } = nextSelection;
      props.onSelectionChange?.({ kind: 'blocks', key: item.key, mode, blocks: keys });
    };

    // A touch may turn out to be a scroll, so it selects on tap or when a long press starts a drag.
    const touch = ev.pointerType === 'touch';
    if (nextSelection.onClick || touch) {
      const handler = (ev: Event) => {
        ev.preventDefault();
        ev.stopPropagation();
        select();
      };
      const target = ev.currentTarget;
      target?.addEventListener('click', handler, { once: true });
      removeClickHandler = () => target?.removeEventListener('click', handler);
    } else {
      select();
    }

    if (ev.target instanceof HTMLElement && ev.currentTarget instanceof HTMLElement) {
      for (const el of ev.currentTarget.querySelectorAll('[data-drag-handle]')) {
        if (el.contains(ev.target)) {
          onDragHandleDown(ev, item.key, () => {
            if (!nextSelection.onClick) {
              removeClickHandler?.();
              select();
            }
          });
          break;
        }
      }
    }
  };

  createTrackedEffect(() => {
    const selection = props.selection;
    if (!selection) return;

    const hasSelection = (selection.blocks?.length ?? 0) > 0 || selection.place != null;
    const hasFocus = document.activeElement === focusElement;

    if (hasSelection && !hasFocus) {
      focusElement.focus({ preventScroll: true });
    }
  });

  const renderItem = (
    item: Item<K, T>,
    tree: Accessor<VirtualTree<K, T>>,
    itemProps: { ghost?: boolean; parentLayout?: 'list' | 'wrap' } = {},
    styles?: Accessor<Map<string, AnimationState>>
  ) => {
    const inWrapParent = itemProps.parentLayout === 'wrap';
    const itemChildren = createMemo(() => tree().children(item.id));
    // The drag ghost renders copies of tree items; only the real ones are measured.
    let element: HTMLElement | undefined;
    const register = (el: HTMLElement) => {
      if (itemProps.ghost) return;
      element = el;
      itemElements.set(item.id, el);
    };
    onCleanup(() => {
      if (element && itemElements.get(item.id) === element) itemElements.delete(item.id);
    });

    if (item.kind === 'container') {
      const isWrap = item.layout === 'wrap';
      return (
        <div
          ref={register}
          class={blockClass}
          data-kind={item.kind}
          data-id={item.id}
          data-layout={item.layout}
          style={{
            [spacingVar]: `${item.spacing}px`,
            ...(isWrap
              ? {
                  display: 'flex',
                  'flex-wrap': 'wrap',
                  gap: `${item.spacing}px`,
                  'align-content': 'flex-start',
                  'align-items': 'flex-start'
                }
              : {}),
            ...(inWrapParent ? { width: '100%' } : {})
          }}
        >
          <For each={itemChildren()}>
            {(child) => renderItem(child, tree, { ghost: itemProps.ghost, parentLayout: item.layout }, styles)}
          </For>
          <Show when={!isWrap}>
            <div class={spacerClass} style={spacerStyle(styles?.().get(item.id))} />
            <div style={{ 'margin-top': '-1px', 'padding-bottom': '1px' }} />
          </Show>
        </div>
      );
    }

    if (item.kind === 'block') {
      // In Legacy API every block gets an empty container child.
      // Only treat it as a "group" if those containers actually hold real blocks.
      const hasRealChildren = createMemo(() =>
        itemChildren().some((c) => {
          if (c.kind !== 'container') return false;
          return tree()
            .children(c.id)
            .some((gc) => gc.kind !== 'placeholder');
        })
      );
      const initiallyHasRealChildren = untrack(hasRealChildren);
      const isWrapLeaf = inWrapParent && !initiallyHasRealChildren;
      const isWrapGroup = inWrapParent && initiallyHasRealChildren;
      return (
        <div
          class={blockClass}
          data-kind={item.kind}
          style={outerStyle(styles?.().get(item.id))}
          onPointerDown={handlePointerDown(item)}
        >
          <div
            ref={(el) => {
              register(el);
              // Apply wrap sizing via direct DOM manipulation (SolidJS style
              // diffing doesn't reliably merge spread objects with reactive styles).
              if (isWrapLeaf) {
                const outer = el.parentElement!;
                outer.style.flex = '0 0 auto';
              } else if (isWrapGroup) {
                el.parentElement!.style.width = '100%';
              }
            }}
            style={innerStyle(styles?.().get(item.id))}
          >
            <Dynamic
              component={props.children}
              key={item.key}
              block={item.block}
              selected={selectedBlocks().includes(item.key)}
              dragging={itemProps.ghost === true || draggedKeys().has(item.key)}
            >
              <For each={itemChildren()}>{(child) => renderItem(child, tree, { ghost: itemProps.ghost }, styles)}</For>
            </Dynamic>
          </div>
        </div>
      );
    }

    if (item.kind === 'placeholder') {
      if (inWrapParent) return null;
      return (
        <div class={blockClass} data-kind={item.kind} style={outerStyle(styles?.().get(item.id))}>
          <div ref={register} style={placeholderStyle(styles?.().get(item.id))}>
            <Dynamic component={props.placeholder ?? Placeholder} parent={item.parent} />
          </div>
        </div>
      );
    }
  };

  const root = createMemo(() => tree().root);

  return (
    <div
      ref={rootElement}
      onFocusOut={(ev) => {
        if (ev.relatedTarget === focusElement) return;
        props.onSelectionChange?.({ kind: 'deselect' });
      }}
      onKeyDown={handleKeyDown}
      onCopy={handleCopy}
      onCut={handleCut}
      onPaste={handlePaste}
      style={{
        position: 'relative',
        height: containerHeight(),
        'box-sizing': 'border-box',
        ['--solidnest-duration']: `${options().transitionDuration}ms`
      }}
    >
      <div ref={focusElement} tabindex={-1} />
      <Show when={root()} keyed>
        {(rootItem) => renderItem(rootItem, tree, {}, styles)}
      </Show>
      <Show when={dropMarkerStyle()}>
        {(style) => (
          <div data-drop={dropTarget()?.kind} style={style()}>
            <Dynamic component={props.dropzone ?? Dropzone} />
          </div>
        )}
      </Show>
      {/* Drag ghost */}
      <Show when={dragTree()} keyed>
        {(tree) => {
          const blocks = tree
            .children(tree.root.id)
            .map((item) => (item.kind === 'block' ? getBlock(item.key) : null))
            .filter(notNull);
          const top = createMemo(() => {
            const state = dragState();
            return state && tree.findItemById(state.topItem);
          });
          return (
            <div style={dragContainerStyle()}>
              <Dynamic component={props.dragContainer ?? DragContainer} blocks={blocks}>
                <Show when={top()} keyed>
                  {(top) => renderItem(top, () => tree, { ghost: true })}
                </Show>
              </Dynamic>
            </div>
          );
        }}
      </Show>
    </div>
  );
}
