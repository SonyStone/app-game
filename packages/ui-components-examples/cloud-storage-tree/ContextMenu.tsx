import { createEffect, JSX, onCleanup, Show } from 'solid-js';

import { useCloudStorage } from './CloudStorageContext';

// ============================================================================
// MARK: Types
// ============================================================================

type ContextMenuItem = {
  label: string;
  icon: string;
  action: () => void;
  disabled?: boolean;
  danger?: boolean;
  divider?: boolean;
};

// ============================================================================
// MARK: Main Component
// ============================================================================

export function ContextMenu(): JSX.Element {
  const { state, actions } = useCloudStorage();
  let menuRef: HTMLDivElement | undefined;

  // Close on click outside
  createEffect(() => {
    if (state.contextMenu.isOpen) {
      const handleClickOutside = (e: MouseEvent) => {
        if (menuRef && !menuRef.contains(e.target as Node)) {
          actions.closeContextMenu();
        }
      };

      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          actions.closeContextMenu();
        }
      };

      // Delay to avoid immediate closing from the same click
      setTimeout(() => {
        document.addEventListener('click', handleClickOutside);
        document.addEventListener('keydown', handleEscape);
      }, 0);

      onCleanup(() => {
        document.removeEventListener('click', handleClickOutside);
        document.removeEventListener('keydown', handleEscape);
      });
    }
  });

  const getMenuItems = (): ContextMenuItem[] => {
    const targetIds = state.contextMenu.targetIds;
    const hasSelection = targetIds.length > 0;
    const singleSelection = targetIds.length === 1;

    const items: ContextMenuItem[] = [];

    // Open folder (only for single folder selection)
    if (singleSelection) {
      const targetNode = state.items.find((item) => item.id === targetIds[0]);
      if (targetNode?.type === 'folder') {
        items.push({
          label: 'Open',
          icon: '📂',
          action: () => {
            actions.navigateToFolder(targetIds[0]);
            actions.closeContextMenu();
          }
        });
      }
    }

    // Create actions
    items.push({
      label: 'New Folder',
      icon: '📁',
      action: () => {
        actions.openDialog('create-folder');
        actions.closeContextMenu();
      }
    });

    items.push({
      label: 'New File',
      icon: '📄',
      action: () => {
        actions.openDialog('create-file');
        actions.closeContextMenu();
      }
    });

    // Divider
    items.push({ label: '', icon: '', action: () => {}, divider: true });

    // Rename (only for single selection)
    if (singleSelection) {
      const targetNode = state.items.find((item) => item.id === targetIds[0]);
      items.push({
        label: 'Rename',
        icon: '✏️',
        action: () => {
          actions.openDialog('rename', targetIds[0], targetNode?.name);
          actions.closeContextMenu();
        }
      });
    }

    // Delete
    if (hasSelection) {
      items.push({ label: '', icon: '', action: () => {}, divider: true });
      items.push({
        label: `Delete${targetIds.length > 1 ? ` (${targetIds.length})` : ''}`,
        icon: '🗑️',
        action: () => {
          // Select the target items if not already selected
          if (!targetIds.every((id) => state.selection.selectedIds.has(id))) {
            targetIds.forEach((id) => {
              state.selection.selectedIds.add(id);
            });
          }
          actions.openDialog('delete');
          actions.closeContextMenu();
        },
        danger: true
      });
    }

    // Refresh
    items.push({ label: '', icon: '', action: () => {}, divider: true });
    items.push({
      label: 'Refresh',
      icon: '🔄',
      action: () => {
        actions.refresh();
        actions.closeContextMenu();
      }
    });

    return items;
  };

  // Adjust position to stay within viewport
  const getPosition = () => {
    const menuWidth = 180;
    const menuHeight = 250;
    const padding = 8;

    let x = state.contextMenu.x;
    let y = state.contextMenu.y;

    if (x + menuWidth > window.innerWidth - padding) {
      x = window.innerWidth - menuWidth - padding;
    }

    if (y + menuHeight > window.innerHeight - padding) {
      y = window.innerHeight - menuHeight - padding;
    }

    return { x: Math.max(padding, x), y: Math.max(padding, y) };
  };

  return (
    <Show when={state.contextMenu.isOpen}>
      <div
        ref={menuRef}
        class="z-1000 min-w-45 fixed rounded-lg border border-neutral-700 bg-neutral-800 py-1 shadow-xl"
        style={{
          left: `${getPosition().x}px`,
          top: `${getPosition().y}px`
        }}
      >
        {getMenuItems().map((item) =>
          item.divider ? (
            <div class="my-1 h-px bg-neutral-700" />
          ) : (
            <button
              class={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-neutral-700 ${
                item.danger ? 'text-red-400 hover:bg-red-900/30' : 'text-neutral-200'
              } ${item.disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
              onClick={item.action}
              disabled={item.disabled}
            >
              <span class="w-5 text-center">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          )
        )}
      </div>
    </Show>
  );
}
