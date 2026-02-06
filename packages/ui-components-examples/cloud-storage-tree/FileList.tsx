import { For, JSX, Show } from 'solid-js';

import { useCloudStorage } from './CloudStorageContext';
import { getFileIcon } from './TreeView';
import type { FileSystemNode } from './types';
import { createLongPressHandlers, isTouchDevice } from './useLongPress';

// ============================================================================
// MARK: Main Component
// ============================================================================

export function FileList(): JSX.Element {
  const { state, actions } = useCloudStorage();

  const handleContainerClick = (e: MouseEvent) => {
    // Click on empty space clears selection
    if (e.target === e.currentTarget) {
      actions.clearSelection();
    }
  };

  const handleContainerContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    // Right-click on empty space
    if (e.target === e.currentTarget) {
      actions.clearSelection();
      actions.openContextMenu(e.clientX, e.clientY, []);
    }
  };

  return (
    <div
      class="flex-1 overflow-auto bg-neutral-900 p-2"
      onClick={handleContainerClick}
      onContextMenu={handleContainerContextMenu}
    >
      <Show
        when={!state.isLoading}
        fallback={
          <div class="flex h-full items-center justify-center text-neutral-500">
            <span class="animate-pulse">Loading...</span>
          </div>
        }
      >
        <Show
          when={state.items.length > 0}
          fallback={
            <div class="flex h-full flex-col items-center justify-center gap-2 text-neutral-500">
              <span class="text-4xl">📂</span>
              <span>This folder is empty</span>
            </div>
          }
        >
          {/* Table Header */}
          <div class="mb-1 grid grid-cols-[1fr_auto] gap-2 border-b border-neutral-700 px-2 py-2 text-xs font-medium uppercase tracking-wide text-neutral-500 sm:grid-cols-[1fr_100px]">
            <span>Name</span>
            <span class="text-right">Size</span>
          </div>

          {/* File List */}
          <For each={state.items}>{(item) => <FileListItem item={item} />}</For>
        </Show>
      </Show>

      {/* Error Display */}
      <Show when={state.error}>
        <div class="mt-4 rounded border border-red-800 bg-red-900/20 p-3 text-sm text-red-400">{state.error}</div>
      </Show>
    </div>
  );
}

// ============================================================================
// MARK: Sub-Components
// ============================================================================

function FileListItem(props: { item: FileSystemNode }): JSX.Element {
  const { state, actions } = useCloudStorage();

  const isSelected = () => state.selection.selectedIds.has(props.item.id);

  // Detect touch device for different interaction modes
  const isTouch = isTouchDevice();

  const handleClick = (e: MouseEvent) => {
    e.stopPropagation();

    // On touch devices, single tap on folder navigates into it
    if (isTouch && props.item.type === 'folder') {
      actions.navigateToFolder(props.item.id);
      return;
    }

    // On desktop, click selects
    actions.selectItem(props.item.id, e.ctrlKey || e.metaKey, e.shiftKey);
  };

  const handleDoubleClick = () => {
    // Double-click to open folder (desktop only, touch uses single tap)
    if (props.item.type === 'folder') {
      actions.navigateToFolder(props.item.id);
    }
  };

  const handleContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // If right-clicking on a non-selected item, select it first
    if (!state.selection.selectedIds.has(props.item.id)) {
      actions.selectItem(props.item.id, false, false);
    }

    // Open context menu with all selected items
    const targetIds = state.selection.selectedIds.has(props.item.id)
      ? Array.from(state.selection.selectedIds)
      : [props.item.id];

    actions.openContextMenu(e.clientX, e.clientY, targetIds);
  };

  // Long press handlers for mobile context menu
  const longPressHandlers = createLongPressHandlers({
    onLongPress: (e) => {
      // Select the item first
      actions.selectItem(props.item.id, false, false);
      // Open context menu at touch position
      actions.openContextMenu(e.clientX, e.clientY, [props.item.id]);
    }
  });

  const icon = () => {
    if (props.item.type === 'folder') {
      return '📁';
    }
    return getFileIcon(props.item.name);
  };

  return (
    <div
      class={`grid cursor-pointer grid-cols-[1fr_auto] items-center gap-2 rounded px-2 py-1.5 sm:grid-cols-[1fr_100px] ${
        isSelected() ? 'bg-blue-600/30 text-blue-200' : 'text-neutral-200 hover:bg-neutral-800'
      }`}
      onClick={handleClick}
      onDblClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
      onPointerDown={longPressHandlers.onPointerDown}
      onPointerUp={longPressHandlers.onPointerUp}
      onPointerLeave={longPressHandlers.onPointerLeave}
      onPointerCancel={longPressHandlers.onPointerCancel}
    >
      <div class="flex min-w-0 items-center gap-2">
        <span class="shrink-0 text-base">{icon()}</span>
        <span class="truncate text-sm">{props.item.name}</span>
      </div>

      <span class="text-right text-xs text-neutral-500">
        {props.item.type === 'folder'
          ? formatFolderItemCount(props.item.childCount)
          : formatFileSize(props.item.size ?? 0)}
      </span>
    </div>
  );
}

// ============================================================================
// MARK: Helper Functions
// ============================================================================

function formatFolderItemCount(count?: number): string {
  if (count === undefined || count === 0) return 'Empty';
  return `${count} item${count !== 1 ? 's' : ''}`;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${units[i]}`;
}
