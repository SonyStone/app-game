import { createContext, For, JSX, Show, useContext } from 'solid-js';

import { useCloudStorage } from './CloudStorageContext';

// ============================================================================
// MARK: Types
// ============================================================================

export type TreeViewProps = {
  class?: string;
  onNavigate?: () => void;
};

// Context for passing onNavigate to nested TreeNodes
const TreeViewContext = createContext<{ onNavigate?: () => void }>({});

// ============================================================================
// MARK: Main Component
// ============================================================================

export function TreeView(props: TreeViewProps): JSX.Element {
  const { treeData } = useCloudStorage();

  // Get root folder's child count
  const rootChildCount = () => treeData().get('root')?.length ?? 0;

  return (
    <TreeViewContext.Provider value={{ onNavigate: props.onNavigate }}>
      <div class={`flex flex-col overflow-auto bg-neutral-900 ${props.class ?? ''}`}>
        <TreeNode nodeId="root" name="storage:" type="folder" level={0} childCount={rootChildCount()} />
      </div>
    </TreeViewContext.Provider>
  );
}

// ============================================================================
// MARK: Sub-Components
// ============================================================================

function TreeNode(props: {
  nodeId: string;
  name: string;
  type: 'file' | 'folder';
  level: number;
  childCount?: number;
}): JSX.Element {
  const { state, actions, treeData } = useCloudStorage();
  const treeViewContext = useContext(TreeViewContext);

  const isExpanded = () => state.expandedFolders.has(props.nodeId);
  const isCurrentFolder = () => state.currentFolderId === props.nodeId;
  const children = () => treeData().get(props.nodeId) ?? [];
  const isFolder = () => props.type === 'folder';
  const isEmpty = () => props.childCount === 0;
  const hasExpandableChildren = () => isFolder() && !isEmpty();

  const handleArrowClick = (e: MouseEvent) => {
    e.stopPropagation();
    if (hasExpandableChildren()) {
      actions.toggleExpand(props.nodeId);
    }
  };

  const handleNodeClick = () => {
    if (props.type === 'folder') {
      actions.navigateToFolder(props.nodeId);
      // Call onNavigate callback (used to close mobile sidebar)
      treeViewContext.onNavigate?.();
    }
  };

  const handleContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    actions.openContextMenu(e.clientX, e.clientY, [props.nodeId]);
  };

  const icon = () => {
    if (props.type === 'folder') {
      return isExpanded() ? '📂' : '📁';
    }
    return getFileIcon(props.name);
  };

  return (
    <div class="select-none">
      <div
        class={`flex cursor-pointer items-center gap-1 px-2 py-1 py-2.5 hover:bg-neutral-700 sm:py-1 ${
          isCurrentFolder() ? 'bg-neutral-700/80 text-blue-400' : 'text-neutral-200'
        }`}
        style={{ 'padding-left': `${props.level * 16 + 8}px` }}
        onClick={handleNodeClick}
        onContextMenu={handleContextMenu}
      >
        {/* Expand/Collapse Arrow - only show for non-empty folders */}
        <Show when={hasExpandableChildren()} fallback={<span class="w-4 w-6 sm:w-4" />}>
          <button
            class="flex h-6 w-6 items-center justify-center rounded text-neutral-400 hover:bg-neutral-600 hover:text-neutral-200 sm:h-4 sm:w-4"
            onClick={handleArrowClick}
          >
            <span
              class="text-sm transition-transform duration-150 sm:text-xs"
              style={{ transform: isExpanded() ? 'rotate(90deg)' : 'rotate(0deg)' }}
            >
              ▶
            </span>
          </button>
        </Show>

        {/* Icon */}
        <span class="text-base sm:text-sm">{icon()}</span>

        {/* Name */}
        <span class="truncate text-base sm:text-sm">{props.name}</span>

        {/* Item count or Empty indicator for folders */}
        <Show when={isFolder()}>
          <span class="ml-1 text-xs text-neutral-500">
            {isEmpty() ? <span class="italic">Empty</span> : `(${props.childCount})`}
          </span>
        </Show>
      </div>

      {/* Children */}
      <Show when={isExpanded() && hasExpandableChildren()}>
        <div class="flex flex-col">
          <For each={children()}>
            {(child) => (
              <TreeNode
                nodeId={child.id}
                name={child.name}
                type={child.type}
                level={props.level + 1}
                childCount={child.childCount}
              />
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

// ============================================================================
// MARK: Helper Functions
// ============================================================================

function getFileIcon(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';

  const iconMap: Record<string, string> = {
    // Documents
    pdf: '📄',
    doc: '📝',
    docx: '📝',
    txt: '📝',
    md: '📝',

    // Spreadsheets
    xls: '📊',
    xlsx: '📊',
    csv: '📊',

    // Presentations
    ppt: '📽️',
    pptx: '📽️',

    // Images
    jpg: '🖼️',
    jpeg: '🖼️',
    png: '🖼️',
    gif: '🖼️',
    svg: '🖼️',
    webp: '🖼️',

    // Code
    js: '📜',
    ts: '📜',
    jsx: '📜',
    tsx: '📜',
    html: '🌐',
    css: '🎨',
    json: '📋',

    // Archives
    zip: '📦',
    rar: '📦',
    '7z': '📦',
    tar: '📦',
    gz: '📦',

    // Executables
    exe: '⚙️',
    msi: '⚙️',
    dmg: '⚙️',

    // Media
    mp3: '🎵',
    wav: '🎵',
    mp4: '🎬',
    avi: '🎬',
    mkv: '🎬'
  };

  return iconMap[ext] ?? '📄';
}

export { getFileIcon };
