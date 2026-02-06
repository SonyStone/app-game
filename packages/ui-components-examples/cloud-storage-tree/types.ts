// ============================================================================
// MARK: Types
// ============================================================================

export type FileSystemNodeType = 'file' | 'folder';

export type FileSystemNode = {
  id: string;
  name: string;
  type: FileSystemNodeType;
  parentId: string | null;
  size?: number; // in bytes, only for files
  childCount?: number; // number of items inside folder
  createdAt: number;
  updatedAt: number;
};

export type FileSystemTree = {
  nodes: Map<string, FileSystemNode>;
  children: Map<string, string[]>; // parentId -> childIds
};

// ============================================================================
// MARK: JRPC Request/Response Types
// ============================================================================

export type ListFolderRequest = {
  path: string;
};

export type ListFolderResponse = {
  items: FileSystemNode[];
  currentPath: string;
};

export type CreateFolderRequest = {
  parentPath: string;
  name: string;
};

export type CreateFileRequest = {
  parentPath: string;
  name: string;
};

export type RenameRequest = {
  path: string;
  newName: string;
};

export type DeleteRequest = {
  paths: string[];
};

export type MoveRequest = {
  sourcePaths: string[];
  destinationPath: string;
};

// ============================================================================
// MARK: UI State Types
// ============================================================================

export type BreadcrumbItem = {
  id: string;
  name: string;
  path: string;
};

export type SelectionState = {
  selectedIds: Set<string>;
  lastSelectedId: string | null;
};

export type ContextMenuState = {
  isOpen: boolean;
  x: number;
  y: number;
  targetIds: string[];
};

export type DialogState = {
  type: 'create-folder' | 'create-file' | 'rename' | 'delete' | null;
  targetId?: string;
  initialValue?: string;
};
