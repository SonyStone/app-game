/**
 * MARK: BrushTreeGroup
 *
 * A collapsible group (folder) node in the tree view.
 * Can be a top-level file group or a nested sub-folder.
 * Supports drag & drop reordering and context actions.
 */

import { For, Show, createSignal, type JSX } from 'solid-js';
import type { BrushWithPreview } from '~/lib/abr';
import type { GroupNode, TreeNode } from '~/lib/brush-tree';
import { BrushTreeItem } from './BrushTreeItem';

export type BrushTreeGroupProps = {
  group: GroupNode;
  depth: number;
  selectedIds: Set<string>;
  onToggleExpand: (id: string) => void;
  onSelectBrush: (brush: BrushWithPreview, e: PointerEvent) => void;
  onClickBrush: (brush: BrushWithPreview) => void;
  onExportGroup: (group: GroupNode) => void;
  onDeleteGroup: (group: GroupNode) => void;
  onRenameGroup: (group: GroupNode, newName: string) => void;
  onAddGroup: (parentId: string) => void;
  onDragStart: (nodeId: string, e: DragEvent) => void;
  onDragOver: (nodeId: string, e: DragEvent) => void;
  onDrop: (targetId: string, e: DragEvent) => void;
};

export function BrushTreeGroup(props: BrushTreeGroupProps): JSX.Element {
  const [isEditing, setIsEditing] = createSignal(false);
  const [editName, setEditName] = createSignal('');
  const [showActions, setShowActions] = createSignal(false);
  const [dropTarget, setDropTarget] = createSignal(false);

  const isTopLevel = () => props.depth === 0;

  const brushCount = (): number => {
    const count = (nodes: TreeNode[]): number =>
      nodes.reduce((acc, n) => acc + (n.kind === 'brush' ? 1 : count(n.children)), 0);
    return count(props.group.children);
  };

  const startRename = () => {
    setEditName(props.group.name);
    setIsEditing(true);
    setShowActions(false);
  };

  const commitRename = () => {
    const name = editName().trim();
    if (name && name !== props.group.name) {
      props.onRenameGroup(props.group, name);
    }
    setIsEditing(false);
  };

  return (
    <div
      class={`${dropTarget() ? 'ring-ps-accent rounded ring-1' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDropTarget(true);
        props.onDragOver(props.group.id, e);
      }}
      onDragLeave={() => setDropTarget(false)}
      onDrop={(e) => {
        e.stopPropagation();
        setDropTarget(false);
        props.onDrop(props.group.id, e);
      }}
    >
      {/* Group Header */}
      <div
        class={`group flex cursor-pointer items-center gap-1 rounded px-2 py-1.5 transition-colors select-none ${
          isTopLevel() ? 'bg-ps-bg-light hover:bg-ps-bg-lighter' : 'hover:bg-ps-bg-light'
        }`}
        style={{ 'padding-left': `${props.depth * 16 + 8}px` }}
        draggable={true}
        onDragStart={(e) => props.onDragStart(props.group.id, e)}
        onClick={() => props.onToggleExpand(props.group.id)}
      >
        {/* Expand chevron */}
        <svg
          class={`text-ps-text-muted h-3.5 w-3.5 shrink-0 transition-transform duration-150 ${
            props.group.expanded ? 'rotate-90' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>

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
              onClick={(e) => e.stopPropagation()}
            />
          }
        >
          <span class="text-ps-text-bright flex-1 truncate text-sm font-medium" title={props.group.name}>
            {props.group.name}
          </span>
        </Show>

        {/* Brush count badge */}
        <span class="text-ps-text-muted shrink-0 text-xs">{brushCount()}</span>

        {/* Actions button */}
        <div class="relative shrink-0">
          <button
            class="text-ps-text-muted hover:text-ps-text-bright rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100"
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
              onClick={(e) => e.stopPropagation()}
              onPointerLeave={() => setShowActions(false)}
            >
              <button
                class="text-ps-text hover:bg-ps-bg-lighter flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm"
                onClick={() => {
                  props.onExportGroup(props.group);
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
                  props.onAddGroup(props.group.id);
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
                  props.onDeleteGroup(props.group);
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

      {/* Children (expanded) */}
      <Show when={props.group.expanded}>
        <div class="mt-0.5">
          {/* Sub-groups first, then brushes in a grid */}
          <For each={props.group.children.filter((c) => c.kind === 'group')}>
            {(child) => (
              <BrushTreeGroup
                group={child as GroupNode}
                depth={props.depth + 1}
                selectedIds={props.selectedIds}
                onToggleExpand={props.onToggleExpand}
                onSelectBrush={props.onSelectBrush}
                onClickBrush={props.onClickBrush}
                onExportGroup={props.onExportGroup}
                onDeleteGroup={props.onDeleteGroup}
                onRenameGroup={props.onRenameGroup}
                onAddGroup={props.onAddGroup}
                onDragStart={props.onDragStart}
                onDragOver={props.onDragOver}
                onDrop={props.onDrop}
              />
            )}
          </For>

          {/* Brush grid inside this group */}
          <Show when={props.group.children.some((c) => c.kind === 'brush')}>
            <div
              class="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
              style={{
                'padding-left': `${(props.depth + 1) * 16}px`,
                'padding-right': '4px',
                'padding-top': '4px',
                'padding-bottom': '8px'
              }}
            >
              <For each={props.group.children.filter((c) => c.kind === 'brush')}>
                {(child) => {
                  const brush = () => (child as { kind: 'brush'; brush: BrushWithPreview }).brush;
                  return (
                    <BrushTreeItem
                      brush={brush()}
                      selected={props.selectedIds.has(brush().id)}
                      depth={0}
                      onSelect={props.onSelectBrush}
                      onClick={props.onClickBrush}
                      onDragStart={props.onDragStart}
                    />
                  );
                }}
              </For>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
}
