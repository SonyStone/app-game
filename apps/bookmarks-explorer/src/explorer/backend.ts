import type { ExplorerSourceId, ExplorerTreeNode } from './model';
import type { PortableExplorerNode } from './portable';

/** Query and command boundary implemented by extension, website, or remote-data adapters. */
export type ExplorerBackend = {
  /** Features available from this backend. */
  readonly capabilities: ExplorerBackendCapabilities;
  /** Loads a normalized tree without exposing platform API objects. */
  load(source: ExplorerSourceId): Promise<ExplorerTreeNode>;
  /** Subscribes to external collection changes and returns an unsubscribe callback. */
  subscribe(listener: (source: ExplorerSourceId) => void): () => void;
  /** Executes a validated explorer command. */
  execute(command: ExplorerCommand): Promise<void>;
};

/** Features a backend can expose to the shared explorer application. */
export type ExplorerBackendCapabilities = Readonly<{
  sources: Readonly<Record<ExplorerSourceId, boolean>>;
  commands: Readonly<Record<ExplorerCommand['kind'], boolean>>;
}>;

/** Platform-neutral mutations produced by explorer interactions. */
export type ExplorerCommand =
  | {
      kind: 'move-tab';
      tabId: string;
      sourceWindowId: string;
      sourceIndex: number;
      targetWindowId: string;
      targetIndex: number;
    }
  | { kind: 'open-tab'; windowId: string; index: number; url: string }
  | {
      kind: 'move-bookmark';
      bookmarkId: string;
      itemKind: 'bookmark' | 'folder';
      sourceFolderId: string;
      sourceIndex: number;
      targetFolderId: string;
      targetIndex: number;
    }
  | { kind: 'create-bookmark'; folderId: string; index: number; title: string; url: string }
  | {
      kind: 'import-items';
      target: ExplorerImportTarget;
      index: number;
      items: PortableExplorerNode[];
    }
  | {
      kind: 'move-document-node';
      source: { source: ExplorerSourceId; nodeId: string; parentId: string | null; index: number };
      target: { source: ExplorerSourceId; parentId: string | null; index: number };
    };

/** Backend-neutral destinations that can materialize portable explorer nodes. */
export type ExplorerImportTarget =
  | { kind: 'window'; id: string }
  | { kind: 'bookmark-folder'; id: string }
  | { kind: 'document'; source: ExplorerSourceId; parentId: string | null };

/** Complete capability set used by browser-extension backends. */
export const FULL_EXPLORER_CAPABILITIES = {
  sources: { explore: true, bookmarks: true, history: true },
  commands: {
    'move-tab': true,
    'open-tab': true,
    'move-bookmark': true,
    'create-bookmark': true,
    'import-items': true,
    'move-document-node': false
  }
} as const satisfies ExplorerBackendCapabilities;
