import { makeEventListener } from '@solid-primitives/event-listener';
import { createSignal, JSX, onMount, Show } from 'solid-js';

import { Breadcrumbs } from './Breadcrumbs';
import { CloudStorageProvider, useCloudStorage } from './CloudStorageContext';
import { ContextMenu } from './ContextMenu';
import { DialogOverlay } from './Dialogs';
import { FileList } from './FileList';
import { Toolbar } from './Toolbar';
import { TreeView } from './TreeView';

// ============================================================================
// MARK: Main Component (Export)
// ============================================================================

export default function CloudStorageTreePage(): JSX.Element {
  return (
    <CloudStorageProvider>
      <CloudStorageApp />
    </CloudStorageProvider>
  );
}

// ============================================================================
// MARK: App Component
// ============================================================================

function CloudStorageApp(): JSX.Element {
  const { state, actions } = useCloudStorage();
  const [isSidebarOpen, setSidebarOpen] = createSignal(false);

  // Global keyboard shortcuts
  onMount(() => {
    makeEventListener(document, 'keydown', (e: KeyboardEvent) => {
      // Don't handle shortcuts when dialog is open or typing in input
      if (state.dialog.type !== null) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      // Ctrl+A - Select all
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        actions.selectAll();
      }

      // Delete - Delete selected
      if (e.key === 'Delete' && state.selection.selectedIds.size > 0) {
        e.preventDefault();
        actions.openDialog('delete');
      }

      // F2 - Rename (single selection)
      if (e.key === 'F2' && state.selection.selectedIds.size === 1) {
        e.preventDefault();
        const selectedId = Array.from(state.selection.selectedIds)[0];
        const selectedItem = state.items.find((item) => item.id === selectedId);
        if (selectedItem) {
          actions.openDialog('rename', selectedId, selectedItem.name);
        }
      }

      // Escape - Clear selection
      if (e.key === 'Escape') {
        actions.clearSelection();
        actions.closeContextMenu();
      }

      // Enter - Open selected folder
      if (e.key === 'Enter' && state.selection.selectedIds.size === 1) {
        const selectedId = Array.from(state.selection.selectedIds)[0];
        const selectedItem = state.items.find((item) => item.id === selectedId);
        if (selectedItem?.type === 'folder') {
          actions.navigateToFolder(selectedId);
        }
      }

      // Backspace - Go to parent folder
      if (e.key === 'Backspace' && state.breadcrumbs.length > 1) {
        e.preventDefault();
        const parentId = state.breadcrumbs[state.breadcrumbs.length - 2]?.id;
        if (parentId) {
          actions.navigateToFolder(parentId);
        }
      }
    });
  });

  return (
    <div class="flex h-screen flex-col bg-neutral-900 text-neutral-100">
      {/* Header */}
      <header class="flex items-center justify-between border-b border-neutral-700 bg-neutral-800 px-4 py-3">
        <div class="flex items-center gap-2">
          {/* Mobile sidebar toggle */}
          <button
            class="rounded p-1.5 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200 md:hidden"
            onClick={() => setSidebarOpen(true)}
            title="Open folders"
          >
            <span class="text-lg">☰</span>
          </button>
          <h1 class="text-lg font-medium">Cloud Storage</h1>
        </div>
        <button
          class="rounded px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-700 hover:text-neutral-300"
          onClick={() => actions.closeContextMenu()}
          title="Close context menu"
        >
          ✕
        </button>
      </header>

      {/* Main Content */}
      <div class="flex min-h-0 flex-1">
        {/* Sidebar - Tree View (desktop: always visible, mobile: slide-over) */}
        <aside class="hidden w-60 shrink-0 flex-col border-r border-neutral-700 md:flex">
          <div class="border-b border-neutral-700 bg-neutral-800 px-3 py-2 text-sm font-medium text-neutral-400">
            Folders
          </div>
          <TreeView class="flex-1" />
        </aside>

        {/* Mobile Sidebar Overlay */}
        <Show when={isSidebarOpen()}>
          <div class="z-100 fixed inset-0 flex md:hidden">
            {/* Backdrop */}
            <div class="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />

            {/* Sidebar Panel */}
            <aside class="relative flex w-72 max-w-[80vw] flex-col bg-neutral-900 shadow-xl">
              <div class="flex items-center justify-between border-b border-neutral-700 bg-neutral-800 px-3 py-2">
                <span class="text-sm font-medium text-neutral-400">Folders</span>
                <button
                  class="rounded p-1 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200"
                  onClick={() => setSidebarOpen(false)}
                >
                  ✕
                </button>
              </div>
              <TreeView class="flex-1" onNavigate={() => setSidebarOpen(false)} />
            </aside>
          </div>
        </Show>

        {/* Main Area */}
        <main class="flex min-w-0 flex-1 flex-col">
          {/* Toolbar */}
          <Toolbar />

          {/* Breadcrumbs */}
          <Breadcrumbs />

          {/* File List */}
          <FileList />
        </main>
      </div>

      {/* Status Bar */}
      <footer class="flex items-center justify-between border-t border-neutral-700 bg-neutral-800 px-4 py-1.5 text-xs text-neutral-500">
        <span>
          {state.items.length} item{state.items.length !== 1 ? 's' : ''}
        </span>
        <span>{state.selection.selectedIds.size > 0 && <>{state.selection.selectedIds.size} selected</>}</span>
      </footer>

      {/* Overlays */}
      <ContextMenu />
      <DialogOverlay />
    </div>
  );
}
