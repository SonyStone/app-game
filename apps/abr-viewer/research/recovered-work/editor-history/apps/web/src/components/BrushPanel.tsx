/**
 * MARK: Types
 *
 * The main Photoshop-style brush panel. Contains the master tree list
 * with drag & drop, multi-select, search, and export.
 */

import { makeEventListener } from '@solid-primitives/event-listener';
import { For, Show, createMemo, createSignal, onMount, type JSX } from 'solid-js';
import {
  AbrWriter,
  brushTipToDataUrl,
  createAbrFile,
  downloadAbrFile,
  type AbrFileWithMeta,
  type BrushWithPreview
} from '~/lib/abr';
import {
  allBrushNodes,
  buildTreeFromFile,
  countBrushes,
  filterTree,
  findNode,
  groupToAbrFile,
  insertNode,
  removeNode,
  type GroupNode
} from '~/lib/brush-tree';
import { BrushTreeGroup } from './BrushTreeGroup';
import { SearchBar } from './SearchBar';
import { SelectionBox } from './SelectionBox';

// ============================================================================
// MARK: BrushPanel
// ============================================================================

export type BrushPanelProps = {
  onOpenBrushDetail: (brush: BrushWithPreview) => void;
};

export function BrushPanel(props: BrushPanelProps): JSX.Element {
  // Master list of top-level groups (file groups)
  const [tree, setTree] = createSignal<GroupNode[]>([]);
  const [searchQuery, setSearchQuery] = createSignal('');
  const [selectedBrushIds, setSelectedBrushIds] = createSignal<Set<string>>(new Set());
  const [lastSelectedId, setLastSelectedId] = createSignal<string | null>(null);
  const [draggedNodeId, setDraggedNodeId] = createSignal<string | null>(null);
  const [loading, setLoading] = createSignal(false);

  let panelRef!: HTMLDivElement;

  // Filtered view
  const displayTree = createMemo(() => {
    const q = searchQuery();
    if (!q) return tree();
    return filterTree(tree(), q) as GroupNode[];
  });

  const totalBrushes = createMemo(() => countBrushes(tree()));

  const selectedCount = createMemo(() => selectedBrushIds().size);

  // ============================================================================
  // MARK: File Loading
  // ============================================================================

  const handleFilesDropped = async (files: File[]) => {
    setLoading(true);
    try {
      const { AbrParser } = await import('~/lib/abr');
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
          fileGroup.expanded = true; // Auto-expand newly loaded files
          setTree((prev) => [...prev, fileGroup]);
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

  onMount(() => {
    makeEventListener(panelRef, 'dragover', (e: DragEvent) => {
      // Only handle file drops from OS, not internal drag
      if (e.dataTransfer?.types.includes('Files')) {
        e.preventDefault();
      }
    });

    makeEventListener(panelRef, 'drop', (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) {
        e.preventDefault();
        const files = Array.from(e.dataTransfer.files).filter((f) => f.name.toLowerCase().endsWith('.abr'));
        if (files.length > 0) handleFilesDropped(files);
      }
    });
  });

  // ============================================================================
  // MARK: Selection
  // ============================================================================

  const handleSelectBrush = (brush: BrushWithPreview, e: PointerEvent) => {
    setSelectedBrushIds((prev) => {
      const next = new Set(prev);

      if (e.shiftKey && lastSelectedId()) {
        // Range select: select all brushes between last and current
        const allBrushes = allBrushNodes(tree());
        const lastIdx = allBrushes.findIndex((b) => b.brush.id === lastSelectedId());
        const curIdx = allBrushes.findIndex((b) => b.brush.id === brush.id);
        if (lastIdx >= 0 && curIdx >= 0) {
          const [start, end] = lastIdx < curIdx ? [lastIdx, curIdx] : [curIdx, lastIdx];
          for (let i = start; i <= end; i++) {
            next.add(allBrushes[i].brush.id);
          }
        }
      } else if (e.ctrlKey || e.metaKey) {
        // Toggle single
        if (next.has(brush.id)) next.delete(brush.id);
        else next.add(brush.id);
      } else {
        // Single select
        next.clear();
        next.add(brush.id);
      }

      return next;
    });
    setLastSelectedId(brush.id);
  };

  const handleClickBrush = (brush: BrushWithPreview) => {
    props.onOpenBrushDetail(brush);
  };

  const clearSelection = () => {
    setSelectedBrushIds(new Set<string>());
    setLastSelectedId(null);
  };

  // ============================================================================
  // MARK: Internal Drag & Drop (reordering)
  // ============================================================================

  const handleDragStart = (nodeId: string, e: DragEvent) => {
    setDraggedNodeId(nodeId);
    e.dataTransfer!.effectAllowed = 'move';
    e.dataTransfer!.setData('text/plain', nodeId);
  };

  const handleDragOver = (_nodeId: string, e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'move';
  };

  const handleDrop = (targetId: string, e: DragEvent) => {
    e.preventDefault();
    const sourceId = draggedNodeId();
    if (!sourceId || sourceId === targetId) return;

    setTree((prev) => {
      const newTree = structuredClone(prev);
      const removed = removeNode(newTree, sourceId);
      if (!removed) return prev;

      const targetInfo = findNode(newTree, targetId);
      if (!targetInfo) return prev;

      if (targetInfo.node.kind === 'group') {
        // Drop into group
        insertNode(newTree, removed, targetId, 'inside');
      } else {
        // Drop next to brush
        insertNode(newTree, removed, targetId, 'after');
      }

      return newTree;
    });

    setDraggedNodeId(null);
  };

  // Also handle drop on the root panel (between top-level groups)
  const handleRootDrop = (e: DragEvent) => {
    e.preventDefault();
    const sourceId = draggedNodeId();
    if (!sourceId) return;

    setTree((prev) => {
      const newTree = structuredClone(prev);
      const removed = removeNode(newTree, sourceId);
      if (!removed) return prev;

      // Append at end of root
      if (removed.kind === 'group') {
        newTree.push(removed as GroupNode);
      }
      return newTree;
    });
    setDraggedNodeId(null);
  };

  // ============================================================================
  // MARK: Tree Mutations
  // ============================================================================

  const handleToggleExpand = (id: string) => {
    setTree((prev) => {
      const newTree = structuredClone(prev);
      const found = findNode(newTree, id);
      if (found && found.node.kind === 'group') {
        (found.node as GroupNode).expanded = !(found.node as GroupNode).expanded;
      }
      return newTree;
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
    setTree((prev) => {
      const newTree = structuredClone(prev);
      removeNode(newTree, group.id);
      return newTree;
    });
  };

  const handleRenameGroup = (group: GroupNode, newName: string) => {
    setTree((prev) => {
      const newTree = structuredClone(prev);
      const found = findNode(newTree, group.id);
      if (found) found.node.name = newName;
      return newTree;
    });
  };

  const handleAddGroup = (parentId: string) => {
    setTree((prev) => {
      const newTree = structuredClone(prev);
      const newGroup: GroupNode = {
        id: `group_${Date.now()}`,
        kind: 'group',
        name: 'New Folder',
        expanded: true,
        children: []
      };
      insertNode(newTree, newGroup, parentId, 'inside');
      return newTree;
    });
  };

  const handleNewFileGroup = () => {
    const newGroup: GroupNode = {
      id: `file_${Date.now()}`,
      kind: 'group',
      name: `New Brushes ${tree().length + 1}.abr`,
      expanded: true,
      children: []
    };
    setTree((prev) => [...prev, newGroup]);
  };

  // ============================================================================
  // MARK: Batch Operations
  // ============================================================================

  const handleExportSelected = () => {
    const ids = selectedBrushIds();
    if (ids.size === 0) return;

    const brushes = allBrushNodes(tree())
      .filter((b) => ids.has(b.brush.id))
      .map((b) => b.brush);

    const abrFile = createAbrFile(brushes);
    const writer = new AbrWriter();
    const data = writer.write(abrFile);
    downloadAbrFile(data, 'selected-brushes.abr');
  };

  const handleDeleteSelected = () => {
    const ids = selectedBrushIds();
    if (ids.size === 0) return;
    if (!confirm(`Delete ${ids.size} selected brush(es)?`)) return;

    setTree((prev) => {
      const newTree = structuredClone(prev);
      for (const id of ids) {
        removeNode(newTree, id);
      }
      return newTree;
    });
    clearSelection();
  };

  const handleExportAll = () => {
    if (tree().length === 0) return;

    // Build a virtual root group containing everything
    const allBrushes = allBrushNodes(tree()).map((b) => b.brush);
    const abrFile = createAbrFile(allBrushes);
    const writer = new AbrWriter();
    const data = writer.write(abrFile);
    downloadAbrFile(data, 'all-brushes.abr');
  };

  // Selection box callback
  const handleBoxSelect = (ids: Set<string>) => {
    setSelectedBrushIds(ids);
  };

  // ============================================================================
  // MARK: Render
  // ============================================================================

  return (
    <div ref={panelRef} class="flex h-full flex-col">
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

        <Show when={tree().length > 0}>
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
      <div
        class="relative flex-1 overflow-y-auto"
        onDragOver={(e) => {
          if (e.dataTransfer?.types.includes('text/plain')) {
            e.preventDefault();
          }
        }}
        onDrop={handleRootDrop}
      >
        <Show when={tree().length > 0} fallback={<EmptyState onFilesDropped={handleFilesDropped} />}>
          <div class="space-y-0.5 py-2">
            <For each={displayTree()}>
              {(group) => (
                <BrushTreeGroup
                  group={group}
                  depth={0}
                  selectedIds={selectedBrushIds()}
                  onToggleExpand={handleToggleExpand}
                  onSelectBrush={handleSelectBrush}
                  onClickBrush={handleClickBrush}
                  onExportGroup={handleExportGroup}
                  onDeleteGroup={handleDeleteGroup}
                  onRenameGroup={handleRenameGroup}
                  onAddGroup={handleAddGroup}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                />
              )}
            </For>
          </div>

          {/* Footer stats */}
          <div class="border-ps-border text-ps-text-muted border-t px-4 py-2 text-xs">
            {tree().length} group(s) • {totalBrushes()} brush(es)
          </div>
        </Show>

        {/* Drag-select box */}
        <SelectionBox
          containerRef={panelRef}
          allBrushIds={allBrushNodes(tree()).map((b) => b.brush.id)}
          onSelect={handleBoxSelect}
        />
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
