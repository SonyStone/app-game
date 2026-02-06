import { Accessor, createContext, createSignal, JSX, Setter, useContext } from 'solid-js';
import { createStore, SetStoreFunction } from 'solid-js/store';

import { mockJrpcService } from './mock-jrpc.service';
import type { ContextMenuState, DialogState, FileSystemNode, SelectionState } from './types';

// ============================================================================
// MARK: Types
// ============================================================================

export type CloudStorageState = {
  currentFolderId: string;
  items: FileSystemNode[];
  breadcrumbs: FileSystemNode[];
  expandedFolders: Set<string>;
  selection: SelectionState;
  contextMenu: ContextMenuState;
  dialog: DialogState;
  isLoading: boolean;
  error: string | null;
};

export type CloudStorageActions = {
  navigateToFolder: (folderId: string) => Promise<void>;
  toggleExpand: (folderId: string) => void;
  selectItem: (id: string, isCtrlKey: boolean, isShiftKey: boolean) => void;
  clearSelection: () => void;
  selectAll: () => void;
  openContextMenu: (x: number, y: number, targetIds: string[]) => void;
  closeContextMenu: () => void;
  openDialog: (type: DialogState['type'], targetId?: string, initialValue?: string) => void;
  closeDialog: () => void;
  createFolder: (name: string) => Promise<void>;
  createFile: (name: string) => Promise<void>;
  rename: (newName: string) => Promise<void>;
  deleteSelected: () => Promise<void>;
  refresh: () => Promise<void>;
};

type CloudStorageContextValue = {
  state: CloudStorageState;
  setState: SetStoreFunction<CloudStorageState>;
  actions: CloudStorageActions;
  treeData: Accessor<Map<string, FileSystemNode[]>>;
  setTreeData: Setter<Map<string, FileSystemNode[]>>;
};

// ============================================================================
// MARK: Context
// ============================================================================

const CloudStorageContext = createContext<CloudStorageContextValue>();

export function useCloudStorage(): CloudStorageContextValue {
  const context = useContext(CloudStorageContext);
  if (!context) {
    throw new Error('useCloudStorage must be used within CloudStorageProvider');
  }
  return context;
}

// ============================================================================
// MARK: Provider
// ============================================================================

export function CloudStorageProvider(props: { children: JSX.Element }): JSX.Element {
  const [state, setState] = createStore<CloudStorageState>({
    currentFolderId: 'root',
    items: [],
    breadcrumbs: [],
    expandedFolders: new Set(['root']),
    selection: {
      selectedIds: new Set(),
      lastSelectedId: null
    },
    contextMenu: {
      isOpen: false,
      x: 0,
      y: 0,
      targetIds: []
    },
    dialog: {
      type: null
    },
    isLoading: false,
    error: null
  });

  // Tree data for expanded folders
  const [treeData, setTreeData] = createSignal<Map<string, FileSystemNode[]>>(new Map());

  const loadFolderContents = async (folderId: string): Promise<FileSystemNode[]> => {
    const response = await mockJrpcService.listFolder(folderId);
    return response.items;
  };

  const actions: CloudStorageActions = {
    async navigateToFolder(folderId: string) {
      setState('isLoading', true);
      setState('error', null);

      try {
        const [response, breadcrumbs] = await Promise.all([
          mockJrpcService.listFolder(folderId),
          mockJrpcService.getBreadcrumbs(folderId)
        ]);

        setState('currentFolderId', folderId);
        setState('items', response.items);
        setState('breadcrumbs', breadcrumbs);
        setState('selection', { selectedIds: new Set(), lastSelectedId: null });

        // Auto-expand the current folder in tree view
        setState('expandedFolders', (prev) => {
          const next = new Set(prev);
          next.add(folderId);
          return next;
        });

        // Load tree data for this folder
        setTreeData((prev) => {
          const next = new Map(prev);
          next.set(folderId, response.items);
          return next;
        });
      } catch (err) {
        setState('error', err instanceof Error ? err.message : 'Failed to load folder');
      } finally {
        setState('isLoading', false);
      }
    },

    toggleExpand(folderId: string) {
      const isExpanded = state.expandedFolders.has(folderId);

      setState('expandedFolders', (prev) => {
        const next = new Set(prev);
        if (isExpanded) {
          next.delete(folderId);
        } else {
          next.add(folderId);
        }
        return next;
      });

      // Load children if expanding and not loaded yet
      if (!isExpanded && !treeData().has(folderId)) {
        loadFolderContents(folderId).then((items) => {
          setTreeData((prev) => {
            const next = new Map(prev);
            next.set(folderId, items);
            return next;
          });
        });
      }
    },

    selectItem(id: string, isCtrlKey: boolean, isShiftKey: boolean) {
      setState('selection', (prev) => {
        const next = new Set(prev.selectedIds);

        if (isShiftKey && prev.lastSelectedId) {
          // Range selection
          const allIds = state.items.map((item) => item.id);
          const startIdx = allIds.indexOf(prev.lastSelectedId);
          const endIdx = allIds.indexOf(id);

          if (startIdx !== -1 && endIdx !== -1) {
            const [from, to] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
            for (let i = from; i <= to; i++) {
              next.add(allIds[i]);
            }
          }

          return { selectedIds: next, lastSelectedId: id };
        } else if (isCtrlKey) {
          // Toggle selection
          if (next.has(id)) {
            next.delete(id);
          } else {
            next.add(id);
          }
          return { selectedIds: next, lastSelectedId: id };
        } else {
          // Single selection
          return { selectedIds: new Set([id]), lastSelectedId: id };
        }
      });
    },

    clearSelection() {
      setState('selection', { selectedIds: new Set(), lastSelectedId: null });
    },

    selectAll() {
      setState('selection', {
        selectedIds: new Set(state.items.map((item) => item.id)),
        lastSelectedId: state.items[state.items.length - 1]?.id ?? null
      });
    },

    openContextMenu(x: number, y: number, targetIds: string[]) {
      setState('contextMenu', {
        isOpen: true,
        x,
        y,
        targetIds
      });
    },

    closeContextMenu() {
      setState('contextMenu', 'isOpen', false);
    },

    openDialog(type, targetId, initialValue) {
      setState('dialog', { type, targetId, initialValue });
    },

    closeDialog() {
      setState('dialog', { type: null, targetId: undefined, initialValue: undefined });
    },

    async createFolder(name: string) {
      setState('isLoading', true);
      try {
        await mockJrpcService.createFolder({
          parentPath: state.currentFolderId,
          name
        });
        await actions.refresh();
        actions.closeDialog();
      } catch (err) {
        setState('error', err instanceof Error ? err.message : 'Failed to create folder');
      } finally {
        setState('isLoading', false);
      }
    },

    async createFile(name: string) {
      setState('isLoading', true);
      try {
        await mockJrpcService.createFile({
          parentPath: state.currentFolderId,
          name
        });
        await actions.refresh();
        actions.closeDialog();
      } catch (err) {
        setState('error', err instanceof Error ? err.message : 'Failed to create file');
      } finally {
        setState('isLoading', false);
      }
    },

    async rename(newName: string) {
      if (!state.dialog.targetId) return;

      setState('isLoading', true);
      try {
        await mockJrpcService.rename({
          path: state.dialog.targetId,
          newName
        });
        await actions.refresh();
        actions.closeDialog();
      } catch (err) {
        setState('error', err instanceof Error ? err.message : 'Failed to rename');
      } finally {
        setState('isLoading', false);
      }
    },

    async deleteSelected() {
      const idsToDelete = Array.from(state.selection.selectedIds);
      if (idsToDelete.length === 0) return;

      setState('isLoading', true);
      try {
        await mockJrpcService.delete({ paths: idsToDelete });
        await actions.refresh();
        actions.closeDialog();
        actions.clearSelection();
      } catch (err) {
        setState('error', err instanceof Error ? err.message : 'Failed to delete');
      } finally {
        setState('isLoading', false);
      }
    },

    async refresh() {
      const response = await mockJrpcService.listFolder(state.currentFolderId);
      setState('items', response.items);

      // Update tree data for current folder
      setTreeData((prev) => {
        const next = new Map(prev);
        next.set(state.currentFolderId, response.items);
        return next;
      });
    }
  };

  // Initial load
  actions.navigateToFolder('root');

  return (
    <CloudStorageContext.Provider value={{ state, setState, actions, treeData, setTreeData }}>
      {props.children}
    </CloudStorageContext.Provider>
  );
}
