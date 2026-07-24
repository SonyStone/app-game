import type { JSX } from 'solid-js';
import { createMemo, createSignal } from 'solid-js';
import type { TreeViewItem, TreeViewModel } from './createTreeView';

/** Creates optional roving focus, single selection, and keyboard navigation for a headless tree. */
export function createTreeKeyboardNavigation<T>(props: {
  /** Headless tree whose visible order and expansion state drive navigation. */
  tree: TreeViewModel<T>;
  /** Ensures a destination is mounted before focus moves, for example in a virtual tree. */
  scrollTo?: (item: TreeViewItem<T>) => void;
  /** Invoked when Enter activates a leaf item. */
  onActivate?: (item: T) => void;
}) {
  const elements = new Map<string, HTMLElement>();
  const [focusedId, setFocusedId] = createSignal<string | null>(null);
  const [selectedId, setSelectedId] = createSignal<string | null>(null);
  const tabStopId = createMemo(() => {
    const visibleItems = props.tree.visibleItems();
    const currentFocusedId = focusedId();
    return visibleItems.some((item) => item.id === currentFocusedId) ? currentFocusedId : (visibleItems[0]?.id ?? null);
  });

  return {
    /** Optional row properties; omit them to render a tree without keyboard or selection behavior. */
    rowProps(item: TreeViewItem<T>): JSX.HTMLAttributes<HTMLDivElement> {
      return {
        ref: (element) => elements.set(item.id, element),
        tabIndex: isTabStop(item) ? 0 : -1,
        'aria-selected': selectedId() === item.id,
        onFocus: () => setFocusedId(item.id),
        onClick: () => {
          setSelectedId(item.id);
          focusItem(item);
        },
        onKeyDown: (event) => handleKeyDown(event, item)
      };
    },
    /** Whether the row currently owns roving focus. */
    isFocused(item: TreeViewItem<T>): boolean {
      return focusedId() === item.id;
    },
    /** Whether the row is the current single selection. */
    isSelected(item: TreeViewItem<T>): boolean {
      return selectedId() === item.id;
    },
    /** Moves DOM focus and selection to an item when it is currently visible. */
    focus(item: TreeViewItem<T>): boolean {
      if (!props.tree.visibleItems().some((candidate) => candidate.id === item.id)) {
        return false;
      }
      focusItem(item);
      return true;
    },
    /** Clears the current selection without changing focus. */
    clearSelection(): void {
      setSelectedId(null);
    }
  } as const;

  function isTabStop(item: TreeViewItem<T>): boolean {
    return tabStopId() === item.id;
  }

  function handleKeyDown(event: KeyboardEvent, item: TreeViewItem<T>): void {
    if (event.target !== event.currentTarget) {
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        focusByOffset(item, 1);
        break;
      case 'ArrowUp':
        focusByOffset(item, -1);
        break;
      case 'ArrowRight':
        focusRight(item);
        break;
      case 'ArrowLeft':
        focusLeft(item);
        break;
      case 'Home':
        focusAt(0);
        break;
      case 'End':
        focusAt(props.tree.visibleItems().length - 1);
        break;
      case 'Enter':
        if (item.childCount > 0) {
          item.toggle();
        } else {
          props.onActivate?.(item.item);
        }
        break;
      case ' ':
        setSelectedId(item.id);
        break;
      default:
        return;
    }

    event.preventDefault();
    event.stopPropagation();
  }

  function focusByOffset(item: TreeViewItem<T>, offset: number): void {
    const items = props.tree.visibleItems();
    const index = items.findIndex((candidate) => candidate.id === item.id);
    focusAt(index + offset);
  }

  function focusRight(item: TreeViewItem<T>): void {
    if (item.childCount === 0) {
      return;
    }

    if (!item.isExpanded) {
      item.setExpanded(true);
      return;
    }

    const child = item.children()[0];
    if (child) {
      focusItem(child);
    }
  }

  function focusLeft(item: TreeViewItem<T>): void {
    if (item.childCount > 0 && item.isExpanded) {
      item.setExpanded(false);
      return;
    }

    const items = props.tree.visibleItems();
    const index = items.findIndex((candidate) => candidate.id === item.id);
    for (let candidateIndex = index - 1; candidateIndex >= 0; candidateIndex -= 1) {
      const candidate = items[candidateIndex];
      if (candidate && candidate.depth === item.depth - 1) {
        focusItem(candidate);
        return;
      }
    }
  }

  function focusAt(index: number): void {
    const item = props.tree.visibleItems()[index];
    if (item) {
      focusItem(item);
    }
  }

  function focusItem(item: TreeViewItem<T>): void {
    props.scrollTo?.(item);
    setFocusedId(item.id);
    setSelectedId(item.id);
    queueMicrotask(() => {
      if (focusedId() !== item.id) {
        return;
      }
      if (!focusElement(item)) {
        requestAnimationFrame(() => {
          if (focusedId() === item.id) {
            focusElement(item);
          }
        });
      }
    });
  }

  function focusElement(item: TreeViewItem<T>): boolean {
    const element = elements.get(item.id);
    if (!element?.isConnected) {
      return false;
    }
    element.focus();
    return true;
  }
}

/** Props accepted by {@link createTreeKeyboardNavigation}. */
export type CreateTreeKeyboardNavigationProps<T> = Parameters<typeof createTreeKeyboardNavigation<T>>[0];
