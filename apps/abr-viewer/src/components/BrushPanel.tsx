import type { JSX } from '@solidjs/web';
/**
 * MARK: Types
 *
 * The main Photoshop-style brush panel. Contains the master tree list
 * with drag & drop via solid-nest, multi-select, search, and export.
 */

import { createEventListener } from '@solid-primitives/event-listener';
import { createMemo, createSignal, createStore, For, Show } from 'solid-js';
import {
  BlockTree,
  type BlockProps,
  type RemoveEvent,
  type ReorderEvent,
  type Selection,
  type SelectionEvent
} from 'solid-nest';
import {
  AbrParser,
  AbrWriter,
  brushTipToDataUrl,
  createAbrFile,
  downloadAbrFile,
  type AbrFileWithMeta,
  type BrushWithPreview
} from '../lib/abr';
import {
  allBrushNodes,
  buildTreeFromFile,
  countBrushes,
  createRootNode,
  filterTree,
  groupToAbrFile,
  insertBlocksAtPlace,
  removeBlocksById,
  ROOT_ID,
  type GroupNode,
  type TreeNode
} from '../lib/brush-tree';
import { BrushTreeGroup } from './BrushTreeGroup';
import { BrushTreeItem } from './BrushTreeItem';
import { SearchBar } from './SearchBar';

// ============================================================================
// MARK: BrushPanel
// ============================================================================

export type BrushPanelProps = {
  onOpenBrushDetail: (brush: BrushWithPreview) => void;
};

export function BrushPanel(props: BrushPanelProps): JSX.Element {
  // Virtual root wrapping all top-level file groups
  const [root, setRoot] = createStore<GroupNode>(createRootNode());

  // solid-nest selection state
  const [selection, setSelection] = createSignal<Selection<string>>({});

  const [searchQuery, setSearchQuery] = createSignal('');
  const [loading, setLoading] = createSignal(false);

  const [panelRef, setPanelRef] = createSignal<HTMLDivElement | undefined>(undefined, { ownedWrite: true });

  // The top-level groups (children of virtual root)
  const topGroups = (): GroupNode[] => root.children.filter((c): c is GroupNode => c.kind === 'group');

  // Selected block keys
  const selectedIds = createMemo(() => new Set(selection().blocks ?? []));
  const selectedCount = createMemo(() => selectedIds().size);

  // Total brush count
  const totalBrushes = createMemo(() => countBrushes(root.children));

  // Filtered view for search — we create a new tree but only for display logic
  const isSearchActive = createMemo(() => searchQuery().length > 0);

  // ============================================================================
  // MARK: File Loading
  // ============================================================================

  const handleFilesDropped = async (files: File[]) => {
    setLoading(true);
    try {
      const parser = new AbrParser();

      for (const file of files) {
        try {
          const buffer = await file.arrayBuffer();
          const result = parser.parse(buffer) as AbrFileWithMeta;
          result.fileName = file.name;

          // Generate preview images
          for (const brush of result.brushes) {
            if (brush.brushTip) {
              try {
                (brush as BrushWithPreview).imageDataUrl = brushTipToDataUrl(brush.brushTip);
              } catch (err) {
                console.warn(`Failed to generate preview for brush ${brush.name}:`, err);
              }
            }
          }

          const fileGroup = buildTreeFromFile(result);
          fileGroup.expanded = true;
          setRoot((draft) => {
            draft.children.push(fileGroup);
          });
        } catch (err) {
          console.error(`Error parsing ${file.name}:`, err);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  // ============================================================================
  // MARK: Drag & Drop for files from OS
  // ============================================================================

  createEventListener(panelRef, 'dragover', (e: DragEvent) => {
    if (e.dataTransfer?.types.includes('Files')) {
      e.preventDefault();
    }
  });

  createEventListener(panelRef, 'drop', (e: DragEvent) => {
    if (e.dataTransfer?.types.includes('Files')) {
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files).filter((f) => f.name.toLowerCase().endsWith('.abr'));
      if (files.length > 0) handleFilesDropped(files);
    }
  });

  // ============================================================================
  // MARK: solid-nest Event Handlers
  // ============================================================================

  const handleSelectionChange = (event: SelectionEvent<string>) => {
    setSelection(event as Selection<string>);
  };

  const handleReorder = (event: ReorderEvent<string>) => {
    setRoot((draft) => {
      const blocks: TreeNode[] = [];
      removeBlocksById(draft, event.keys, blocks);
      insertBlocksAtPlace(draft, blocks, event.place);
    });
  };

  const handleRemove = (event: RemoveEvent<string>) => {
    setRoot((draft) => {
      removeBlocksById(draft, event.keys);
    });
  };

  // ============================================================================
  // MARK: Tree Mutations (context menu actions)
  // ============================================================================

  const handleToggleExpand = (id: string) => {
    setRoot((draft) => {
      const found = findNodeMut(draft, id);
      if (found && found.kind === 'group') {
        found.expanded = !found.expanded;
      }
    });
  };

  const handleExportGroup = (group: GroupNode) => {
    const abrFile = groupToAbrFile(group);
    const writer = new AbrWriter();
    const data = writer.write(abrFile);
    const name = group.name.endsWith('.abr') ? group.name : `${group.name}.abr`;
    downloadAbrFile(data, name);
  };

  const handleDeleteGroup = (group: GroupNode) => {
    const count = countBrushes([group]);
    if (!confirm(`Delete "${group.name}" with ${count} brush(es)?`)) return;
    setRoot((draft) => {
      removeBlocksById(draft, [group.id]);
    });
  };

  const handleRenameGroup = (group: GroupNode, newName: string) => {
    setRoot((draft) => {
      const found = findNodeMut(draft, group.id);
      if (found) found.name = newName;
    });
  };

  const handleAddGroup = (parentId: string) => {
    setRoot((draft) => {
      const parent = findNodeMut(draft, parentId);
      if (parent && parent.kind === 'group') {
        const newGroup: GroupNode = {
          id: `group_${Date.now()}`,
          kind: 'group',
          name: 'New Folder',
          expanded: true,
          children: []
        };
        parent.children.push(newGroup);
      }
    });
  };

  const handleNewFileGroup = () => {
    setRoot((draft) => {
      const newGroup: GroupNode = {
        id: `file_${Date.now()}`,
        kind: 'group',
        name: `New Brushes ${draft.children.length + 1}.abr`,
        expanded: true,
        children: []
      };
      draft.children.push(newGroup);
    });
  };

  // ============================================================================
  // MARK: Batch Operations
  // ============================================================================

  const handleExportSelected = () => {
    const ids = selectedIds();
    if (ids.size === 0) return;

    const brushes = allBrushNodes(root.children)
      .filter((b) => ids.has(b.brush.id) || ids.has(b.id))
      .map((b) => b.brush);

    if (brushes.length === 0) return;
    const abrFile = createAbrFile(brushes);
    const writer = new AbrWriter();
    const data = writer.write(abrFile);
    downloadAbrFile(data, 'selected-brushes.abr');
  };

  const handleDeleteSelected = () => {
    const ids = selectedIds();
    if (ids.size === 0) return;
    if (!confirm(`Delete ${ids.size} selected item(s)?`)) return;

    setRoot((draft) => {
      removeBlocksById(draft, [...ids]);
    });
    setSelection({});
  };

  const handleExportAll = () => {
    if (root.children.length === 0) return;
    const allBrushes = allBrushNodes(root.children).map((b) => b.brush);
    const abrFile = createAbrFile(allBrushes);
    const writer = new AbrWriter();
    const data = writer.write(abrFile);
    downloadAbrFile(data, 'all-brushes.abr');
  };

  const clearSelection = () => {
    setSelection({});
  };

  // ============================================================================
  // MARK: Render
  // ============================================================================

  return (
    <div ref={setPanelRef} class="flex h-full flex-col">
      {/* Toolbar */}
      <div class="bg-ps-bg border-ps-border flex items-center gap-2 border-b px-4 py-2">
        <div class="flex-1">
          <SearchBar value={searchQuery()} onSearch={setSearchQuery} placeholder="Search brushes and groups..." />
        </div>

        <button
          onClick={handleNewFileGroup}
          class="flex items-center gap-1.5 rounded bg-green-600 px-2.5 py-1.5 text-xs text-white hover:bg-green-700"
          title="Create new brush file"
        >
          <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          New
        </button>

        <Show when={root.children.length > 0}>
          <button
            onClick={handleExportAll}
            class="flex items-center gap-1.5 rounded bg-purple-600 px-2.5 py-1.5 text-xs text-white hover:bg-purple-700"
            title="Export all as single ABR"
          >
            <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
            Export All
          </button>
        </Show>
      </div>

      {/* Selection toolbar */}
      <Show when={selectedCount() > 0}>
        <div class="bg-ps-accent/10 border-ps-accent/30 flex items-center gap-3 border-b px-4 py-1.5">
          <span class="text-ps-accent text-xs font-medium">{selectedCount()} selected</span>
          <button onClick={handleExportSelected} class="text-ps-accent hover:text-ps-accent-hover text-xs underline">
            Export
          </button>
          <button onClick={handleDeleteSelected} class="text-xs text-red-400 underline hover:text-red-300">
            Delete
          </button>
          <button onClick={clearSelection} class="text-ps-text-muted hover:text-ps-text text-xs underline">
            Clear
          </button>
        </div>
      </Show>

      {/* Loading overlay */}
      <Show when={loading()}>
        <div class="flex items-center gap-3 px-4 py-3">
          <svg class="text-ps-accent h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span class="text-ps-text text-sm">Parsing brushes...</span>
        </div>
      </Show>

      {/* Tree content */}
      <div class="relative flex-1 overflow-y-auto">
        <Show when={root.children.length > 0} fallback={<EmptyState onFilesDropped={handleFilesDropped} />}>
          <Show
            when={!isSearchActive()}
            fallback={
              <SearchResults
                tree={root.children}
                query={searchQuery()}
                selectedIds={selectedIds()}
                onOpenBrushDetail={props.onOpenBrushDetail}
                onToggleExpand={handleToggleExpand}
                onExportGroup={handleExportGroup}
                onDeleteGroup={handleDeleteGroup}
                onRenameGroup={handleRenameGroup}
                onAddGroup={handleAddGroup}
              />
            }
          >
            <div class="py-2">
              <BlockTree<string, TreeNode>
                root={root}
                getKey={(block: TreeNode) => block.id}
                getChildren={(block: TreeNode) => (block.kind === 'group' ? block.children : undefined)}
                getOptions={(block: TreeNode) => {
                  if (block.kind === 'group') {
                    return { spacing: 2, tag: 'group', accepts: ['group', 'brush'] };
                  }
                  return { tag: 'brush' };
                }}
                selection={selection()}
                onSelectionChange={handleSelectionChange}
                onReorder={handleReorder}
                onRemove={handleRemove}
                multiselect={true}
                transitionDuration={200}
                fixedHeightWhileDragging={true}
              >
                {(blockProps: BlockProps<string, TreeNode>) => (
                  <>
                    <Show
                      when={
                        blockProps.block.kind === 'group' && blockProps.block.id !== ROOT_ID
                          ? blockProps.block
                          : undefined
                      }
                    >
                      {(group) => (
                        <BrushTreeGroup
                          block={group()}
                          selected={blockProps.selected}
                          dragging={blockProps.dragging}
                          childrenSlot={blockProps.children}
                          onToggleExpand={handleToggleExpand}
                          onExportGroup={handleExportGroup}
                          onDeleteGroup={handleDeleteGroup}
                          onRenameGroup={handleRenameGroup}
                          onAddGroup={handleAddGroup}
                        />
                      )}
                    </Show>
                    <Show when={blockProps.block.kind === 'brush' ? blockProps.block : undefined}>
                      {(brush) => (
                        <BrushTreeItem
                          block={brush()}
                          selected={blockProps.selected}
                          dragging={blockProps.dragging}
                          onClickBrush={props.onOpenBrushDetail}
                        />
                      )}
                    </Show>
                    <Show when={blockProps.block.id === ROOT_ID}>{blockProps.children}</Show>
                  </>
                )}
              </BlockTree>
            </div>
          </Show>

          {/* Footer stats */}
          <div class="border-ps-border text-ps-text-muted border-t px-4 py-2 text-xs">
            {topGroups().length} group(s) • {totalBrushes()} brush(es)
          </div>
        </Show>
      </div>
    </div>
  );
}

// ============================================================================
// MARK: Helpers
// ============================================================================

/** Find a node by ID in a mutable tree (for use inside produce). */
function findNodeMut(node: TreeNode, id: string): TreeNode | undefined {
  if (node.id === id) return node;
  if (node.kind === 'group') {
    for (const child of node.children) {
      const found = findNodeMut(child, id);
      if (found) return found;
    }
  }
  return undefined;
}

// ============================================================================
// MARK: SearchResults (fallback when searching — no DnD)
// ============================================================================

function SearchResults(props: {
  tree: TreeNode[];
  query: string;
  selectedIds: Set<string>;
  onOpenBrushDetail: (brush: BrushWithPreview) => void;
  onToggleExpand: (id: string) => void;
  onExportGroup: (group: GroupNode) => void;
  onDeleteGroup: (group: GroupNode) => void;
  onRenameGroup: (group: GroupNode, name: string) => void;
  onAddGroup: (parentId: string) => void;
}): JSX.Element {
  const filtered = createMemo(() => filterTree(props.tree, props.query) as GroupNode[]);

  return (
    <div class="space-y-0.5 py-2">
      <For each={filtered()}>
        {(group) => (
          <SearchGroupNode
            group={group}
            depth={0}
            selectedIds={props.selectedIds}
            onOpenBrushDetail={props.onOpenBrushDetail}
            onToggleExpand={props.onToggleExpand}
            onExportGroup={props.onExportGroup}
            onDeleteGroup={props.onDeleteGroup}
            onRenameGroup={props.onRenameGroup}
            onAddGroup={props.onAddGroup}
          />
        )}
      </For>
    </div>
  );
}

/** A simplified group renderer for search results (no DnD). */
function SearchGroupNode(props: {
  group: GroupNode;
  depth: number;
  selectedIds: Set<string>;
  onOpenBrushDetail: (brush: BrushWithPreview) => void;
  onToggleExpand: (id: string) => void;
  onExportGroup: (group: GroupNode) => void;
  onDeleteGroup: (group: GroupNode) => void;
  onRenameGroup: (group: GroupNode, name: string) => void;
  onAddGroup: (parentId: string) => void;
}): JSX.Element {
  const isTopLevel = () => props.depth === 0;
  const brushCount = (): number => {
    const count = (nodes: TreeNode[]): number =>
      nodes.reduce((acc, n) => acc + (n.kind === 'brush' ? 1 : count(n.children)), 0);
    return count(props.group.children);
  };

  return (
    <div>
      <div
        class={`group flex cursor-pointer items-center gap-1 rounded px-2 py-1.5 transition-colors select-none ${
          isTopLevel() ? 'bg-ps-bg-light hover:bg-ps-bg-lighter' : 'hover:bg-ps-bg-light'
        }`}
        style={{ 'padding-left': `${props.depth * 16 + 8}px` }}
        onClick={() => props.onToggleExpand(props.group.id)}
      >
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
        <svg
          class={`h-4 w-4 shrink-0 ${isTopLevel() ? 'text-ps-accent' : 'text-yellow-500/80'}`}
          fill="currentColor"
          viewBox="0 0 24 24"
        >
          <path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z" />
        </svg>
        <span class="text-ps-text-bright flex-1 truncate text-sm font-medium">{props.group.name}</span>
        <span class="text-ps-text-muted shrink-0 text-xs">{brushCount()}</span>
      </div>

      <Show when={props.group.expanded}>
        <div class="mt-0.5">
          <For each={props.group.children.filter((c) => c.kind === 'group')}>
            {(child) => (
              <SearchGroupNode
                group={child as GroupNode}
                depth={props.depth + 1}
                selectedIds={props.selectedIds}
                onOpenBrushDetail={props.onOpenBrushDetail}
                onToggleExpand={props.onToggleExpand}
                onExportGroup={props.onExportGroup}
                onDeleteGroup={props.onDeleteGroup}
                onRenameGroup={props.onRenameGroup}
                onAddGroup={props.onAddGroup}
              />
            )}
          </For>
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
                    <SearchBrushCard
                      brush={brush()}
                      selected={props.selectedIds.has(brush().id)}
                      onClick={() => props.onOpenBrushDetail(brush())}
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

/** A simplified brush card for search results (no DnD). */
function SearchBrushCard(props: { brush: BrushWithPreview; selected: boolean; onClick: () => void }): JSX.Element {
  return (
    <div
      class={`group bg-ps-bg cursor-pointer overflow-hidden rounded-lg border transition-all duration-150 ${
        props.selected ? 'border-ps-accent ring-ps-accent ring-1' : 'border-ps-border hover:border-ps-border-light'
      }`}
      onClick={props.onClick}
    >
      <div class="checkered-bg relative aspect-square">
        <Show
          when={props.brush.imageDataUrl}
          fallback={
            <div class="absolute inset-0 flex items-center justify-center">
              <p class="text-ps-text-muted text-[10px]">
                {props.brush.type === 'computed' ? 'Computed' : 'No preview'}
              </p>
            </div>
          }
        >
          <img
            src={props.brush.imageDataUrl}
            alt={props.brush.name}
            class="absolute inset-0 h-full w-full object-contain p-1"
            style={{ 'image-rendering': 'pixelated' }}
          />
        </Show>
      </div>
      <div class="border-ps-border-dark border-t p-2">
        <h3 class="text-ps-text-bright mb-1 truncate text-xs font-medium">{props.brush.name}</h3>
      </div>
    </div>
  );
}

// ============================================================================
// MARK: EmptyState
// ============================================================================

function EmptyState(props: { onFilesDropped: (files: File[]) => void }): JSX.Element {
  const [isDragging, setIsDragging] = createSignal(false);
  let inputRef!: HTMLInputElement;

  return (
    <div class="flex flex-col items-center justify-center px-8 py-16">
      <div
        class={`w-full max-w-lg rounded-xl border-2 border-dashed p-12 text-center transition-colors ${
          isDragging()
            ? 'border-ps-accent bg-ps-accent/5 drop-zone-active'
            : 'border-ps-border hover:border-ps-border-light'
        }`}
        onDragEnter={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const files = Array.from(e.dataTransfer?.files ?? []).filter((f) => f.name.toLowerCase().endsWith('.abr'));
          if (files.length > 0) props.onFilesDropped(files);
        }}
        onClick={() => inputRef.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".abr"
          multiple
          class="hidden"
          onChange={(e) => {
            const files = Array.from(e.currentTarget.files ?? []);
            if (files.length > 0) props.onFilesDropped(files);
            e.currentTarget.value = '';
          }}
        />

        <div class="bg-ps-bg-light mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full">
          <svg class="text-ps-accent h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
        </div>

        <h2 class="text-ps-text-bright mb-2 text-lg font-semibold">Drop .abr files here</h2>
        <p class="text-ps-text-muted text-sm">or click to browse • Supports multiple files</p>

        <div class="mt-4 flex items-center justify-center gap-2">
          <span class="text-ps-text-muted bg-ps-bg-light rounded px-2 py-0.5 text-xs">ABR v6+</span>
          <span class="text-ps-text-muted bg-ps-bg-light rounded px-2 py-0.5 text-xs">ABR v9</span>
          <span class="text-ps-text-muted bg-ps-bg-light rounded px-2 py-0.5 text-xs">ABR v10</span>
        </div>
      </div>

      <div class="mt-8 grid max-w-md grid-cols-3 gap-6 text-center">
        <div>
          <div class="bg-ps-bg-light mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full">
            <svg class="text-ps-accent h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14"
              />
            </svg>
          </div>
          <p class="text-ps-text-muted text-xs">Preview tips</p>
        </div>
        <div>
          <div class="bg-ps-bg-light mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full">
            <svg class="text-ps-accent h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
              />
            </svg>
          </div>
          <p class="text-ps-text-muted text-xs">Organize folders</p>
        </div>
        <div>
          <div class="bg-ps-bg-light mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full">
            <svg class="text-ps-accent h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
          </div>
          <p class="text-ps-text-muted text-xs">Export ABR</p>
        </div>
      </div>
    </div>
  );
}
