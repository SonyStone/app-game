import type { JSX } from 'solid-js';
import { createMemo, createSignal } from 'solid-js';
import type { TreeViewItem, TreeViewModel } from './createTreeView';

/** Creates optional roving focus, single selection, and keyboard navigation for a headless tree. */
export function createTreeKeyboardNavigation<T>(props: {
  /** Headless tree whose visible order and expansion state drive navigation. */
  tree: TreeViewModel<T>;
  /** Ensures a destination is mounted before focus moves, for example in a virtual tree. */
  scrollTo?: (item: TreeViewItem<T>) => void;
  /** Invoked by Space, including Alt+Space for the original alternative restore. */
  onActivate?: (item: T, alternative: boolean) => void;
  /** Invoked when F2 requests editing for the focused item. */
  onEdit?: (item: T) => void;
  /** Invoked when Backspace or Alt+Delete requests save-and-close for the focused item. */
  onSaveClose?: (item: T) => void;
  /** Invoked when Delete requests permanent removal for the focused item. */
  onDelete?: (item: T) => void;
  /** Invoked when Ctrl/Cmd+Z requests restoration of the latest deletion. */
  onUndo?: () => void;
  /** Invoked when Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y requests repeating an undone tree change. */
  onRedo?: () => void;
  /** Invoked when Q requests save-and-close for all browser windows. */
  onSaveAll?: () => void;
  /** Invoked when Ctrl/Cmd+B requests an immediate local backup. */
  onBackup?: () => void;
  /** Invoked when W requests scrolling upward to the previous visible live window. */
  onScrollPreviousWindow?: () => void;
  /** Invoked when S requests the previous stable tree scroll position. */
  onUndoScroll?: () => void;
  /** Invoked when C requests cloning the current explorer view. */
  onCloneView?: () => void;
  /** Invoked by the original Tabs Outliner Enter/Insert/G/L organizer shortcuts. */
  onInsertOrganizer?: (item: T, request: TreeKeyboardOrganizerRequest) => boolean;
  /** Invoked by original structural-move keys, including E for the containing organizer. */
  onMoveItem?: (item: T, direction: TreeKeyboardMoveDirection) => boolean;
  /** Invoked by / to flatten nested tabs without crossing organizer boundaries. */
  onFlatten?: (item: T) => boolean;
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
    /** Returns the currently selected item, or undefined when selection is empty or no longer visible. */
    selectedItem(): T | undefined {
      const currentSelectedId = selectedId();
      return props.tree.visibleItems().find((item) => item.id === currentSelectedId)?.item;
    },
    /** Moves DOM focus and selection to an item when it is currently visible. */
    focus(item: TreeViewItem<T>): boolean {
      if (!props.tree.visibleItems().some((candidate) => candidate.id === item.id)) {
        return false;
      }
      focusItem(item);
      return true;
    },
    /** Selects and scrolls to a visible item without stealing focus from transient UI such as search. */
    select(item: TreeViewItem<T>): boolean {
      if (!props.tree.visibleItems().some((candidate) => candidate.id === item.id)) {
        return false;
      }
      props.scrollTo?.(item);
      setSelectedId(item.id);
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

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      if (event.shiftKey) {
        props.onRedo?.();
      } else {
        props.onUndo?.();
      }
      consumeKeyboardEvent(event);
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
      props.onRedo?.();
      consumeKeyboardEvent(event);
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b') {
      props.onBackup?.();
      consumeKeyboardEvent(event);
      return;
    }
    if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === 'q') {
      props.onSaveAll?.();
      consumeKeyboardEvent(event);
      return;
    }
    if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === 'w') {
      props.onScrollPreviousWindow?.();
      consumeKeyboardEvent(event);
      return;
    }
    if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === 's') {
      props.onUndoScroll?.();
      consumeKeyboardEvent(event);
      return;
    }
    if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === 'c') {
      props.onCloneView?.();
      consumeKeyboardEvent(event);
      return;
    }
    if (event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === 'g') {
      if (props.onInsertOrganizer?.(item.item, { itemKind: 'group', placement: 'before' })) {
        consumeKeyboardEvent(event);
      }
      return;
    }
    if (!event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === 'l') {
      if (props.onInsertOrganizer?.(item.item, { itemKind: 'separator', placement: 'after' })) {
        consumeKeyboardEvent(event);
      }
      return;
    }
    if (!event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === 'e') {
      if (props.onMoveItem?.(item.item, 'tree-end')) {
        consumeKeyboardEvent(event);
      }
      return;
    }
    if (!event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey && event.key === '/') {
      if (props.onFlatten?.(item.item)) {
        consumeKeyboardEvent(event);
      }
      return;
    }
    const moveDirection = keyboardMoveDirection(event);
    if (moveDirection && props.onMoveItem?.(item.item, moveDirection)) {
      consumeKeyboardEvent(event);
      return;
    }
    if (event.key === 'Tab') {
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
        focusSibling(item, 'first');
        break;
      case 'End':
        focusSibling(item, 'last');
        break;
      case 'PageUp':
        focusByOffset(item, -PAGE_ROW_OFFSET);
        break;
      case 'PageDown':
        focusByOffset(item, PAGE_ROW_OFFSET);
        break;
      case 'Enter':
        if (props.onInsertOrganizer?.(item.item, {
          itemKind: 'note',
          placement: event.shiftKey
            ? event.altKey || event.ctrlKey || event.metaKey
              ? 'parent'
              : 'before'
            : event.altKey || event.ctrlKey || event.metaKey
              ? 'tree-end'
              : 'after'
        })) {
          break;
        }
        if (item.childCount > 0) {
          item.toggle();
        } else {
          props.onActivate?.(item.item, false);
        }
        break;
      case 'Insert':
        if (!props.onInsertOrganizer?.(item.item, {
          itemKind: 'note',
          placement: event.shiftKey
            ? 'parent'
            : event.altKey || event.ctrlKey || event.metaKey
              ? 'first-child'
              : 'last-child'
        })) {
          return;
        }
        break;
      case 'F2':
        props.onEdit?.(item.item);
        break;
      case 'Backspace':
        props.onSaveClose?.(item.item);
        break;
      case 'Delete':
        if (event.altKey) {
          props.onSaveClose?.(item.item);
        } else {
          props.onDelete?.(item.item);
        }
        break;
      case '+':
      case '-':
        if (event.ctrlKey || event.metaKey) {
          return;
        }
        if (item.childCount > 0) {
          item.toggle();
        }
        break;
      case ' ':
        setSelectedId(item.id);
        props.onActivate?.(item.item, event.altKey);
        break;
      default:
        return;
    }

    consumeKeyboardEvent(event);
  }

  function consumeKeyboardEvent(event: KeyboardEvent): void {
    event.preventDefault();
    event.stopPropagation();
  }

  function focusByOffset(item: TreeViewItem<T>, offset: number): void {
    const items = props.tree.visibleItems();
    const index = items.findIndex((candidate) => candidate.id === item.id);
    focusAt(index + offset);
  }

  function focusSibling(item: TreeViewItem<T>, position: 'first' | 'last'): void {
    const items = props.tree.visibleItems();
    const currentIndex = items.findIndex((candidate) => candidate.id === item.id);
    if (currentIndex < 0) {
      return;
    }
    let destination = item;
    const direction = position === 'first' ? -1 : 1;
    for (
      let candidateIndex = currentIndex + direction;
      candidateIndex >= 0 && candidateIndex < items.length;
      candidateIndex += direction
    ) {
      const candidate = items[candidateIndex];
      if (!candidate || candidate.depth < item.depth) {
        break;
      }
      if (candidate.depth === item.depth) {
        destination = candidate;
      }
    }
    focusItem(destination);
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

/** Organizer insertion requested by the original Tabs Outliner keyboard map. */
export type TreeKeyboardOrganizerRequest = Readonly<{
  itemKind: 'group' | 'note' | 'separator';
  placement: 'before' | 'after' | 'parent' | 'first-child' | 'last-child' | 'tree-end';
}>;

/** Structural move direction used by the original Tabs Outliner keyboard map. */
export type TreeKeyboardMoveDirection =
  | 'indent'
  | 'outdent'
  | 'up'
  | 'down'
  | 'first'
  | 'last'
  | 'tree-end';

function keyboardMoveDirection(event: KeyboardEvent): TreeKeyboardMoveDirection | undefined {
  if (event.key === 'Tab' && !event.ctrlKey && !event.metaKey && !event.altKey) {
    return event.shiftKey ? 'outdent' : 'indent';
  }
  if (!event.ctrlKey && !event.metaKey) {
    return undefined;
  }
  switch (event.key) {
    case 'ArrowRight':
      return 'indent';
    case 'ArrowLeft':
      return 'outdent';
    case 'ArrowUp':
      return 'up';
    case 'ArrowDown':
      return 'down';
    case 'Home':
      return 'first';
    case 'End':
      return 'last';
    default:
      return undefined;
  }
}

const PAGE_ROW_OFFSET = 10;
