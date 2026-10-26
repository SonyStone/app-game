import { debounce } from '@solid-primitives/scheduled';
import type { DockState, PanelId } from 'solid-dock';
import { findPanelGroup, openPanel } from 'solid-dock';
import {
  createEffect,
  createMemo,
  createSignal,
  createStore,
  deep,
  onSettled,
  reconcile,
  snapshot,
  type StoreSetter
} from 'solid-js';
import {
  addExplorer,
  type BackendKey,
  besidePanel,
  closeWorkspacePanel,
  createDefaultWorkspaceLayout,
  type ExplorerPanelState,
  isPanelVisible,
  primaryExplorer,
  readWorkspaceLayout,
  type ServicePanelKind,
  showUtilityPanel,
  type UtilityPanelId,
  type WorkspaceLayout,
  writeWorkspaceLayout
} from './layout';

/**
 * Owns the workspace layout: reads the stored layout once (`ready` turns true
 * afterwards; render the dock only then, so panels mount with their stored views),
 * saves every later change shortly after it happens and when the page hides, and
 * exposes the commands the app runs. Must run under an owner.
 */
export function createWorkspace(options: {
  /** Browser keys the app offers; stored views of other browsers fall back to the primary one. */
  knownBrowsers: readonly BackendKey[];
  /** Receives storage failures. */
  onError: (reason: unknown) => void;
}) {
  const [layout, setLayout] = createStore<WorkspaceLayout>(createDefaultWorkspaceLayout());
  const [ready, setReady] = createSignal(false);
  const update = (change: (draft: WorkspaceLayout) => void) => setLayout((draft) => void change(draft));

  void readWorkspaceLayout(options.knownBrowsers).then((stored) => {
    setLayout(reconcile(stored, null));
    setReady(true);
  });
  createLayoutSaving(layout, ready, options.onError);

  const explorerIds = createMemo(() =>
    Object.keys(layout.explorers).sort(
      (left, right) => (layout.explorers[left]?.number ?? 0) - (layout.explorers[right]?.number ?? 0)
    )
  );

  return {
    /** Whether the stored layout has been read. */
    ready,
    /** Dock part of the layout, for `<Dock.Root state>`. */
    dock: (): DockState => layout.dock,
    /** Store setter of the dock part, for `<Dock.Root setState>`. */
    setDock: ((change) =>
      setLayout((draft) => {
        const next = change(draft.dock);
        if (next !== undefined) {
          draft.dock = next;
        }
      })) satisfies StoreSetter<DockState>,
    /** Open explorer panel ids ordered by their numbers. */
    explorerIds,
    /** View of an open explorer. */
    explorer: (panelId: PanelId): ExplorerPanelState | undefined => layout.explorers[panelId],
    /** Primary explorer, see {@link WorkspaceLayout.primary}. */
    primaryExplorer: createMemo(() => primaryExplorer(layout)),
    /** Whether a panel is open and the visible tab of its group. */
    isVisible: (panelId: PanelId): boolean => isPanelVisible(layout, panelId),
    /** Browser chosen for a service panel, if any. */
    serviceBackend: (kind: ServicePanelKind): BackendKey | undefined => layout.services[kind],
    /**
     * Opens an explorer and returns its id. `view` receives the new id, so an
     * explorer can be opened on its own document. Without `placement` the
     * explorer opens to the right of the last explorer.
     */
    addExplorer(
      view: (panelId: PanelId) => Pick<ExplorerPanelState, 'backend' | 'source'>,
      placement?: { beside: PanelId; edge: 'left' | 'right' | 'center' }
    ): PanelId {
      let panelId = '';
      update((draft) => {
        panelId = addExplorer(draft, view, placement && besidePanel(draft, placement.beside, placement.edge));
      });
      return panelId;
    },
    /** Changes what an explorer shows. */
    setExplorerView(panelId: PanelId, view: Partial<Pick<ExplorerPanelState, 'backend' | 'source'>>): void {
      update((draft) => {
        const explorer = draft.explorers[panelId];
        if (explorer) {
          Object.assign(explorer, view);
        }
      });
    },
    /** Makes an open explorer the primary one. */
    setPrimary(panelId: PanelId): void {
      update((draft) => {
        if (draft.explorers[panelId]) {
          draft.primary = panelId;
        }
      });
    },
    /** Remembers the browser a service panel shows. */
    setServiceBackend(kind: ServicePanelKind, backend: BackendKey): void {
      update((draft) => {
        draft.services[kind] = backend;
      });
    },
    /** Makes an open panel the visible tab of its group. */
    activate(panelId: PanelId): void {
      update((draft) => {
        if (findPanelGroup(draft.dock, panelId) !== undefined) {
          openPanel(draft.dock, panelId);
        }
      });
    },
    /** Opens or reveals a utility panel, see {@link showUtilityPanel}. */
    showUtilityPanel(panelId: UtilityPanelId): void {
      update((draft) => showUtilityPanel(draft, panelId));
    },
    /** Closes a visible utility panel; opens or reveals a hidden or closed one. */
    toggleUtilityPanel(panelId: UtilityPanelId): void {
      update((draft) =>
        isPanelVisible(draft, panelId) ? closeWorkspacePanel(draft, panelId) : showUtilityPanel(draft, panelId)
      );
    },
    /** Closes any panel, see {@link closeWorkspacePanel}. */
    closePanel(panelId: PanelId): void {
      update((draft) => closeWorkspacePanel(draft, panelId));
    },
    /** Restores the default two-explorer layout. */
    reset(): void {
      setLayout(reconcile(createDefaultWorkspaceLayout(), null));
    }
  };
}

/**
 * Saves the layout once it stops changing for {@link SAVE_DELAY_MS}, so sash
 * drags write once, and immediately when the page hides, so reloads and closed
 * windows keep the last change.
 */
function createLayoutSaving(layout: WorkspaceLayout, ready: () => boolean, onError: (reason: unknown) => void): void {
  let unsaved: WorkspaceLayout | undefined;
  const write = (value: WorkspaceLayout) => {
    unsaved = undefined;
    void writeWorkspaceLayout(value).catch(onError);
  };
  const save = debounce(write, SAVE_DELAY_MS);

  createEffect(
    () => (ready() ? snapshot(deep(layout)) : undefined),
    (value) => {
      if (value) {
        unsaved = value;
        save(value);
      }
    }
  );
  onSettled(() => {
    const saveNow = () => {
      save.clear();
      if (unsaved) {
        write(unsaved);
      }
    };
    globalThis.addEventListener('pagehide', saveNow);

    return () => globalThis.removeEventListener('pagehide', saveNow);
  });
}

const SAVE_DELAY_MS = 300;
