import type { ExplorerSourceId, ExplorerTreeGroupNode, ExplorerTreeNode } from './model';

/** Creates the synthetic root shared by every backend source tree. */
export function createExplorerSourceRoot(
  source: ExplorerSourceId,
  title: string,
  children: ExplorerTreeNode[],
  acceptsDrop = false
): ExplorerTreeGroupNode {
  return {
    id: `${source}-root`,
    kind: 'group',
    groupKind: 'source',
    source,
    reference: { kind: 'source', source },
    index: 0,
    draggable: false,
    acceptsDrop,
    title,
    children,
    defaultCollapsed: false
  };
}

/** Creates an explanatory source tree for a backend that cannot expose browser data. */
export function createUnavailableExplorerTree(source: ExplorerSourceId): ExplorerTreeNode {
  const title = source === 'explore' ? 'Open tabs' : source === 'bookmarks' ? 'Bookmarks' : 'History';
  return createExplorerSourceRoot(source, title, [
    {
      id: `${source}-unavailable`,
      kind: 'message',
      title: 'Browser data requires an extension or another configured explorer backend.'
    }
  ]);
}
