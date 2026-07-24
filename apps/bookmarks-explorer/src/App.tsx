import { createVirtualNestedList } from '@app-game/solid-virtual';
import type { Accessor } from 'solid-js';
import { createMemo, createSignal, For, Show } from 'solid-js';
import type { DocumentExplorerBackend } from './backends/document/createDocumentExplorerBackend';
import { createDocumentExplorerBackend } from './backends/document/createDocumentExplorerBackend';
import type { ExplorerBackend, ExplorerCommand } from './explorer/backend';
import { affectedSources, createExplorerDragAndDrop } from './explorer/createExplorerDragAndDrop';
import { createExplorerSources } from './explorer/createExplorerSources';
import { ExplorerTreeRow } from './explorer/ExplorerTreeRow';
import { readExplorerFile } from './explorer/files';
import type { ExplorerSourceId, ExplorerTreeNode } from './explorer/model';
import { equalExplorerTreeNodes, EXPLORER_SOURCES, getExplorerChildren } from './explorer/model';
import { createTreeKeyboardNavigation } from './tree-view/createTreeKeyboardNavigation';
import { createTreeScrollRestoration } from './tree-view/createTreeScrollRestoration';
import { createTreeView } from './tree-view/createTreeView';
import { TreeDropIndicator } from './tree-view/TreeDropIndicator';
import { TreeSelectionIndicator } from './tree-view/TreeSelectionIndicator';
import { TreeView } from './tree-view/TreeView';

/** Props for the shared browser and website explorer composition. */
export type BookmarksExplorerProps = {
  /** Primary live, fixture, or remote backend shown when the application opens. */
  backend: ExplorerBackend;
  /** User-facing name for the primary backend. Defaults to `Browser`. */
  backendLabel?: string;
};

/** Renders the explorer with a live backend and one drop-loaded document per pane. */
export function BookmarksExplorer(props: BookmarksExplorerProps) {
  const instanceId = createInstanceId();
  const leftDocument = createDocumentExplorerBackend();
  const rightDocument = createDocumentExplorerBackend();
  const [leftDocumentLabel, setLeftDocumentLabel] = createSignal('Left file');
  const [rightDocumentLabel, setRightDocumentLabel] = createSignal('Right file');
  const [operationError, setOperationError] = createSignal<string | null>(null);
  const backends = [
    createBrowserBinding(`${instanceId}:browser`, props.backendLabel ?? 'Browser', props.backend),
    createDocumentBinding(`${instanceId}:left-file`, leftDocumentLabel, setLeftDocumentLabel, leftDocument),
    createDocumentBinding(`${instanceId}:right-file`, rightDocumentLabel, setRightDocumentLabel, rightDocument)
  ] as const satisfies readonly ExplorerBackendBinding[];
  const browserBackend = backends[0];
  const leftFileBackend = backends[1];
  const rightFileBackend = backends[2];
  const dragAndDrop = createExplorerDragAndDrop({ onCommand: executeCommand });

  return (
    <main class="h-screen min-h-0 overflow-hidden bg-neutral-950 text-neutral-100">
      <header class="flex h-8 items-center border-b border-neutral-700 px-2">
        <h1 class="text-sm font-medium">Bookmarks Explorer</h1>
      </header>

      <div class="flex h-[calc(100vh-2rem)] min-h-0">
        <ExplorerPane
          paneId="left"
          initialBackendId={browserBackend.id}
          initialSource="explore"
          label="Left explorer pane"
          backends={backends}
          ownedDocument={leftFileBackend}
          dragAndDrop={dragAndDrop}
          onError={showOperationError}
        />
        <ExplorerPane
          paneId="right"
          initialBackendId={browserBackend.id}
          initialSource="bookmarks"
          label="Right explorer pane"
          backends={backends}
          ownedDocument={rightFileBackend}
          dragAndDrop={dragAndDrop}
          onError={showOperationError}
        />
      </div>

      <Show when={dragAndDrop.feedback()}>{(feedback) => <TreeDropIndicator feedback={feedback()} />}</Show>
      <Show when={dragAndDrop.dropping()}>
        <div class="fixed right-3 bottom-3 z-50 rounded border border-neutral-600 bg-neutral-900 px-3 py-2 text-xs">
          Updating explorer data…
        </div>
      </Show>
      <Show when={dragAndDrop.error() ?? operationError()}>
        {(error) => (
          <div
            class="fixed right-3 bottom-3 z-50 flex max-w-md items-center gap-3 rounded border border-red-700 bg-red-950 px-3 py-2 text-xs text-red-100"
            role="alert"
          >
            <span>{error()}</span>
            <button
              type="button"
              class="text-red-300 hover:text-white"
              onClick={() => {
                dragAndDrop.dismissError();
                setOperationError(null);
              }}
            >
              Dismiss
            </button>
          </div>
        )}
      </Show>
    </main>
  );

  async function executeCommand(backendId: string, command: ExplorerCommand): Promise<void> {
    const binding = backends.find((candidate) => candidate.id === backendId);
    if (!binding) {
      throw new Error('The destination backend is no longer available.');
    }
    if (!binding.backend.capabilities.commands[command.kind]) {
      throw new Error(`${binding.label()} cannot execute ${command.kind}.`);
    }
    await binding.backend.execute(command);
    for (const source of affectedSources(command)) {
      binding.sources.refresh(source);
    }
  }

  function showOperationError(reason: unknown): void {
    setOperationError(reason instanceof Error ? reason.message : 'The file operation could not be completed.');
  }
}

type ExplorerSources = ReturnType<typeof createExplorerSources>;
type ExplorerDragAndDrop = ReturnType<typeof createExplorerDragAndDrop>;

type ExplorerBackendBinding = BrowserBackendBinding | DocumentBackendBinding;

type BrowserBackendBinding = {
  kind: 'browser';
  id: string;
  label: Accessor<string>;
  backend: ExplorerBackend;
  sources: ExplorerSources;
};

type DocumentBackendBinding = {
  kind: 'document';
  id: string;
  label: Accessor<string>;
  setLabel: (label: string) => void;
  backend: ExplorerBackend;
  sources: ExplorerSources;
  document: DocumentExplorerBackend;
};

function ExplorerPane(props: {
  paneId: 'left' | 'right';
  initialBackendId: string;
  initialSource: ExplorerSourceId;
  label: string;
  backends: readonly ExplorerBackendBinding[];
  ownedDocument: DocumentBackendBinding;
  dragAndDrop: ExplorerDragAndDrop;
  onError: (reason: unknown) => void;
}) {
  const [scrollElement, setScrollElement] = createSignal<HTMLDivElement>();
  const [selectedBackendId, setSelectedBackendId] = createSignal(props.initialBackendId);
  const [selectedSource, setSelectedSource] = createSignal<ExplorerSourceId>(props.initialSource);
  const selectedBackend = () =>
    props.backends.find((backend) => backend.id === selectedBackendId()) ?? props.backends[0] ?? props.ownedDocument;
  const tree = createTreeView<ExplorerTreeNode>({
    items: () => {
      const root = selectedBackend().sources.tree(selectedSource());
      return root ? [root] : [];
    },
    getId: (node) => node.id,
    getChildren: getExplorerChildren,
    isItemEqual: equalExplorerTreeNodes,
    isInitiallyExpanded: (node) => node.kind === 'message' || !node.defaultCollapsed
  });
  const virtualTree = createVirtualNestedList({
    items: tree.children,
    elementRef: scrollElement,
    itemHeight: TREE_ROW_HEIGHT,
    getChildren: (item) => item.children(),
    isExpanded: (item) => item.isExpanded,
    overscan: TREE_OVERSCAN,
    gap: 0
  });
  const backgroundDropProps = createMemo(() => {
    const root = tree.children()[0];
    return root ? props.dragAndDrop.dropZoneProps(root.item, selectedBackendId()) : undefined;
  });
  const navigation = createTreeKeyboardNavigation({
    tree,
    scrollTo: (item) => virtualTree.scrollTo(item),
    onActivate(node) {
      if (node.kind === 'link' && node.url) {
        window.open(node.url, '_blank', 'noopener');
      }
    }
  });
  const scrollRestoration = createTreeScrollRestoration({
    key: () => `bookmarks-explorer:tree-scroll:v2:${props.paneId}:${selectedBackendId()}:${selectedSource()}`,
    ready: () => {
      const sources = selectedBackend().sources;
      return (
        !sources.loading(selectedSource()) &&
        sources.error(selectedSource()) === undefined &&
        sources.tree(selectedSource()) !== undefined
      );
    },
    defaultPosition: () => (selectedSource() === 'explore' ? 'end' : 'start')
  });
  return (
    <section class="flex min-w-0 flex-1 flex-col border-r border-neutral-700 last:border-r-0" aria-label={props.label}>
      <div class="flex h-8 flex-none items-end gap-0.5 border-b border-neutral-700 bg-neutral-900 px-1" role="tablist">
        <For each={EXPLORER_SOURCES}>
          {(source) => (
            <button
              type="button"
              role="tab"
              aria-selected={selectedSource() === source.id}
              class="h-7 border border-b-0 px-2 text-xs"
              classList={{
                'border-neutral-600 bg-neutral-800 text-white': selectedSource() === source.id,
                'border-transparent text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100':
                  selectedSource() !== source.id
              }}
              onClick={() => setSelectedSource(source.id)}
            >
              {source.label}
            </button>
          )}
        </For>

        <div class="ml-auto flex h-7 items-center">
          <button
            type="button"
            class="h-6 px-1 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-white"
            title="Refresh from the selected backend"
            aria-label={`Refresh ${selectedSource()}`}
            onClick={() => selectedBackend().sources.refresh(selectedSource())}
          >
            ↻
          </button>
        </div>
      </div>

      <div
        ref={(element) => {
          setScrollElement(element);
          scrollRestoration.setElementRef(element);
        }}
        class="relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto"
        role="tabpanel"
        style={{ 'overflow-anchor': 'none' }}
        onScroll={scrollRestoration.onScroll}
        onWheel={scrollRestoration.onUserInteraction}
        onPointerDown={scrollRestoration.onUserInteraction}
        onTouchStart={scrollRestoration.onUserInteraction}
        onKeyDown={scrollRestoration.onUserInteraction}
        onDragEnter={handlePaneDragEnter}
        onDragOver={handlePaneDragOver}
        onDragLeave={handlePaneDragLeave}
        onDrop={handlePaneDrop}
      >
        <Show when={selectedBackend().sources.tree(selectedSource())} fallback={<UnavailableTreeStatus />}>
          <TreeView
            virtual={virtualTree}
            rowProps={(item) => ({
              ...props.dragAndDrop.rowProps(item.item, selectedBackendId()),
              ...navigation.rowProps(item)
            })}
            rowClass={(item) =>
              props.dragAndDrop.canDrag(item.item) ? 'cursor-grab active:cursor-grabbing' : undefined
            }
          >
            {(item) => (
              <>
                <TreeSelectionIndicator selected={navigation.isSelected(item)} focused={navigation.isFocused(item)} />
                <ExplorerTreeRow node={item.item} />
              </>
            )}
          </TreeView>
        </Show>
      </div>
    </section>
  );

  async function openFile(file: File): Promise<void> {
    try {
      const document = await readExplorerFile(file);
      props.ownedDocument.document.replaceDocument(document);
      props.ownedDocument.setLabel(file.name);
      setSelectedBackendId(props.ownedDocument.id);
      if (document.sources[selectedSource()].length === 0) {
        const populatedSource = EXPLORER_SOURCES.find((source) => document.sources[source.id].length > 0);
        if (populatedSource) {
          setSelectedSource(populatedSource.id);
        }
      }
    } catch (reason: unknown) {
      props.onError(reason);
    }
  }

  function handleFileDragOver(event: DragEvent & { currentTarget: HTMLDivElement }): void {
    if ([...event.dataTransfer?.types ?? []].includes('Files')) {
      event.preventDefault();
      event.dataTransfer!.dropEffect = 'copy';
    }
  }

  function handlePaneDragEnter(event: PaneDragEvent): void {
    if (event.target === event.currentTarget) {
      backgroundDropProps()?.onDragEnter(event);
    }
  }

  function handlePaneDragOver(event: PaneDragEvent): void {
    if ([...(event.dataTransfer?.types ?? [])].includes('Files')) {
      handleFileDragOver(event);
      return;
    }
    if (event.target === event.currentTarget) {
      backgroundDropProps()?.onDragOver(event);
    }
  }

  function handlePaneDragLeave(event: PaneDragEvent): void {
    if (event.target === event.currentTarget) {
      backgroundDropProps()?.onDragLeave(event);
    }
  }

  function handlePaneDrop(event: PaneDragEvent): void {
    const file = event.dataTransfer?.files[0];
    if (file) {
      event.preventDefault();
      event.stopPropagation();
      void openFile(file);
      return;
    }
    if (event.target === event.currentTarget) {
      backgroundDropProps()?.onDrop(event);
    }
  }

  function UnavailableTreeStatus() {
    const error = () => selectedBackend().sources.error(selectedSource());
    return error() ? <TreeStatus tone="error">{formatError(error())}</TreeStatus> : <TreeStatus>Loading data…</TreeStatus>;
  }
}

type PaneDragEvent = DragEvent & { currentTarget: HTMLDivElement; target: Element };

function TreeStatus(props: { children: string; tone?: 'muted' | 'error' }) {
  return (
    <p
      class="p-3 text-xs"
      classList={{ 'text-neutral-400': props.tone !== 'error', 'text-red-400': props.tone === 'error' }}
    >
      {props.children}
    </p>
  );
}

function createBrowserBinding(id: string, label: string, backend: ExplorerBackend): BrowserBackendBinding {
  return { kind: 'browser', id, label: () => label, backend, sources: createExplorerSources(backend) };
}

function createDocumentBinding(
  id: string,
  label: Accessor<string>,
  setLabel: (label: string) => void,
  document: DocumentExplorerBackend
): DocumentBackendBinding {
  return { kind: 'document', id, label, setLabel, backend: document.backend, sources: createExplorerSources(document.backend), document };
}

function createInstanceId(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : 'Explorer data could not be loaded.';
}

const TREE_ROW_HEIGHT = 20;
const TREE_OVERSCAN = 400;
