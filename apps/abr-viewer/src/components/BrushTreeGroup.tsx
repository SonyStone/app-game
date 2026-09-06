import type { JSX } from '@solidjs/web';
/**
 * MARK: BrushTreeGroup
 *
 * A collapsible group (folder) node in the tree view.
 * Renders inside solid-nest's BlockTree — receives block props
 * and a children slot for nested content managed by the library.
 */

import { Show, createSignal } from 'solid-js';
import type { GroupNode, TreeNode } from '../lib/brush-tree';

export type BrushTreeGroupProps = {
  block: GroupNode;
  selected: boolean;
  dragging: boolean;
  /** solid-nest rendered children slot */
  childrenSlot: JSX.Element;
  onToggleExpand: (id: string) => void;
  onExportGroup: (group: GroupNode) => void;
  onDeleteGroup: (group: GroupNode) => void;
  onRenameGroup: (group: GroupNode, newName: string) => void;
  onAddGroup: (parentId: string) => void;
};

export function BrushTreeGroup(props: BrushTreeGroupProps): JSX.Element {
  const [isEditing, setIsEditing] = createSignal(false);
  const [editName, setEditName] = createSignal('');
  const [showActions, setShowActions] = createSignal(false);

  const isTopLevel = () => !props.block.uuid;

  const brushCount = (): number => {
    const count = (nodes: TreeNode[]): number =>
      nodes.reduce((acc, n) => acc + (n.kind === 'brush' ? 1 : count((n as GroupNode).children ?? [])), 0);
    return count(props.block.children);
  };

  const startRename = () => {
    setEditName(props.block.name);
    setIsEditing(true);
    setShowActions(false);
  };

  const commitRename = () => {
    const name = editName().trim();
    if (name && name !== props.block.name) {
      props.onRenameGroup(props.block, name);
    }
    setIsEditing(false);
  };

  return (
    <div
      data-drag-handle
      class={`cursor-grab touch-none rounded border transition-colors duration-100 ${
        props.selected
          ? 'border-ps-accent bg-ps-accent/10'
          : isTopLevel()
            ? 'bg-ps-bg-light border-neutral-700/60'
            : 'border-neutral-700/40 bg-neutral-800/40'
      } ${props.dragging ? 'opacity-50' : ''}`}
    >
      {/* Group Header */}
      <div
        class={`group flex items-center gap-1 px-2 py-1.5 select-none active:cursor-grabbing ${
          props.selected ? 'bg-ps-accent/15' : 'hover:bg-neutral-700/30'
        }`}
      >
        {/* Expand chevron — stopPropagation prevents selection/drag */}
        <button
          class="flex h-4 w-4 shrink-0 items-center justify-center text-neutral-400 hover:text-neutral-200"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => props.onToggleExpand(props.block.id)}
        >
          <svg
            class={`h-3.5 w-3.5 transition-transform duration-150 ${props.block.expanded ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
        </button>

        {/* Folder icon */}
        <svg
          class={`h-4 w-4 shrink-0 ${isTopLevel() ? 'text-ps-accent' : 'text-yellow-500/80'}`}
          fill="currentColor"
          viewBox="0 0 24 24"
        >
          <path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z" />
        </svg>

        {/* Group name */}
        <Show
          when={!isEditing()}
          fallback={
            <input
              type="text"
              class="bg-ps-bg-dark border-ps-accent text-ps-text-bright flex-1 rounded border px-1.5 py-0.5 text-sm outline-none"
              value={editName()}
              onInput={(e) => setEditName(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') setIsEditing(false);
              }}
              onBlur={commitRename}
              ref={(el) => setTimeout(() => el.focus(), 0)}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            />
          }
        >
          <span class="text-ps-text-bright flex-1 truncate text-sm font-medium" title={props.block.name}>
            {props.block.name}
          </span>
        </Show>

        {/* Brush count badge */}
        <span class="text-ps-text-muted shrink-0 text-xs">{brushCount()}</span>

        {/* Actions button */}
        <div class="relative shrink-0">
          <button
            class="text-ps-text-muted hover:text-ps-text-bright rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              setShowActions(!showActions());
            }}
          >
            <svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="5" r="1.5" />
              <circle cx="12" cy="12" r="1.5" />
              <circle cx="12" cy="19" r="1.5" />
            </svg>
          </button>

          {/* Dropdown menu */}
          <Show when={showActions()}>
            <div
              class="bg-ps-bg-light border-ps-border shadow-ps-lg absolute top-full right-0 z-50 mt-1 w-44 rounded-lg border py-1"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              onPointerLeave={() => setShowActions(false)}
            >
              <button
                class="text-ps-text hover:bg-ps-bg-lighter flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm"
                onClick={() => {
                  props.onExportGroup(props.block);
                  setShowActions(false);
                }}
              >
                <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
                Export as ABR
              </button>
              <button
                class="text-ps-text hover:bg-ps-bg-lighter flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm"
                onClick={() => {
                  props.onAddGroup(props.block.id);
                  setShowActions(false);
                }}
              >
                <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                </svg>
                New Sub-folder
              </button>
              <button
                class="text-ps-text hover:bg-ps-bg-lighter flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm"
                onClick={startRename}
              >
                <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                  />
                </svg>
                Rename
              </button>
              <div class="border-ps-border my-1 border-t" />
              <button
                class="hover:bg-ps-bg-lighter flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-red-400"
                onClick={() => {
                  props.onDeleteGroup(props.block);
                  setShowActions(false);
                }}
              >
                <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
                Delete
              </button>
            </div>
          </Show>
        </div>
      </div>

      {/* Children (expanded) — rendered by solid-nest */}
      <Show when={props.block.expanded}>
        <div class="pr-1 pb-1 pl-3">{props.childrenSlot}</div>
      </Show>
    </div>
  );
}
