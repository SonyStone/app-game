import { createSignal } from 'solid-js';
import { createImmediateSignal } from '../../shared/createImmediateSignal';
import { clampDockWidth, defaultLayout, readLayout, type PanelId, type WorkspaceLayout } from './layout';

/**
 * The Desktop variant's workspace: the remembered layout (dock width and side, panel heights and collapsed panels;
 * see `WorkspaceLayout`), saved to `localStorage` after every change, and whether the panels are shown, which Tab
 * toggles for the session only, as in Photoshop. Storage failures keep the layout for this page.
 */
export function createWorkspace() {
  // Commands build on the last written layout, so several changes in one event compose.
  const [layout, setLayout, current] = createImmediateSignal<WorkspaceLayout>(read());
  const [panelsShown, setPanelsShown] = createSignal(true);
  const save = (next: WorkspaceLayout) => {
    setLayout(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // Keep the layout for this page.
    }
  };

  return {
    layout,
    /** Sets the dock's width, limited by `clampDockWidth`. */
    setWidth(width: number) {
      save({ ...current(), width: clampDockWidth(width) });
    },
    setDock(dock: WorkspaceLayout['dock']) {
      save({ ...current(), dock });
    },
    /** Sets the heights of some panels, in CSS pixels. */
    setSizes(sizes: Partial<Record<PanelId, number>>) {
      save({ ...current(), sizes: { ...current().sizes, ...sizes } });
    },
    toggleCollapsed(id: PanelId) {
      save({ ...current(), collapsed: { ...current().collapsed, [id]: !current().collapsed[id] } });
    },
    /** Expands panel `id` and shows the panels, for commands that need it in view. */
    reveal(id: PanelId) {
      setPanelsShown(true);
      if (current().collapsed[id]) {
        save({ ...current(), collapsed: { ...current().collapsed, [id]: false } });
      }
    },
    /** Returns to the first start's layout, keeping the dock's side. */
    reset() {
      save({ ...defaultLayout(), dock: current().dock });
      setPanelsShown(true);
    },
    /** The tool column, options bar and dock are shown. */
    panelsShown,
    togglePanels() {
      setPanelsShown(!panelsShown());
    }
  };
}

/** The workspace; see `createWorkspace`. */
export type Workspace = ReturnType<typeof createWorkspace>;

function read() {
  try {
    return readLayout(localStorage.getItem(storageKey));
  } catch {
    return defaultLayout();
  }
}

const storageKey = 'paint.desktop.layout';
