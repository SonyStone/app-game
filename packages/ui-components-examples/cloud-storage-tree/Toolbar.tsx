import { JSX, Show } from 'solid-js';

import { useCloudStorage } from './CloudStorageContext';

// ============================================================================
// MARK: Types
// ============================================================================

export type ToolbarProps = {
  class?: string;
};

// ============================================================================
// MARK: Main Component
// ============================================================================

export function Toolbar(props: ToolbarProps): JSX.Element {
  const { state, actions } = useCloudStorage();

  const hasSelection = () => state.selection.selectedIds.size > 0;
  const selectionCount = () => state.selection.selectedIds.size;

  return (
    <div class={`flex items-center gap-1 border-b border-neutral-700 bg-neutral-800 p-2 ${props.class ?? ''}`}>
      {/* Create Actions */}
      <ToolbarButton
        icon="📁"
        label="New Folder"
        onClick={() => actions.openDialog('create-folder')}
        title="Create new folder"
      />

      <ToolbarButton
        icon="📄"
        label="New File"
        onClick={() => actions.openDialog('create-file')}
        title="Create new file"
      />

      <div class="mx-1 h-6 w-px bg-neutral-700" />

      {/* Selection Actions */}
      <ToolbarButton
        icon="✏️"
        label="Rename"
        onClick={() => {
          const selectedId = Array.from(state.selection.selectedIds)[0];
          const selectedItem = state.items.find((item) => item.id === selectedId);
          if (selectedItem) {
            actions.openDialog('rename', selectedId, selectedItem.name);
          }
        }}
        disabled={selectionCount() !== 1}
        title="Rename selected item"
      />

      <ToolbarButton
        icon="🗑️"
        label="Delete"
        onClick={() => actions.openDialog('delete')}
        disabled={!hasSelection()}
        danger
        title="Delete selected items"
      />

      <div class="mx-1 h-6 w-px bg-neutral-700" />

      {/* View Actions */}
      <ToolbarButton icon="🔄" label="Refresh" onClick={() => actions.refresh()} title="Refresh current folder" />

      {/* Selection Info */}
      <Show when={hasSelection()}>
        <div class="ml-auto flex items-center gap-2 text-sm text-neutral-400">
          <span>
            {selectionCount()} item{selectionCount() > 1 ? 's' : ''} selected
          </span>
          <button
            class="rounded px-2 py-0.5 text-xs text-neutral-500 hover:bg-neutral-700 hover:text-neutral-300"
            onClick={() => actions.clearSelection()}
          >
            Clear
          </button>
        </div>
      </Show>
    </div>
  );
}

// ============================================================================
// MARK: Sub-Components
// ============================================================================

function ToolbarButton(props: {
  icon: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  title?: string;
}): JSX.Element {
  return (
    <button
      class={`flex items-center gap-1.5 rounded px-2 py-1.5 text-sm transition-colors ${
        props.disabled
          ? 'cursor-not-allowed text-neutral-600'
          : props.danger
            ? 'text-neutral-300 hover:bg-red-900/30 hover:text-red-400'
            : 'text-neutral-300 hover:bg-neutral-700 hover:text-neutral-100'
      }`}
      onClick={props.onClick}
      disabled={props.disabled}
      title={props.title}
    >
      <span>{props.icon}</span>
      <span class="hidden sm:inline">{props.label}</span>
    </button>
  );
}
