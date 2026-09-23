import { createSignal } from 'solid-js';
import type { ViewerError } from '../../shared/errors';

/** UI state shared by the toolbar and the mounted document session. GPU ownership belongs to providers. */
export function createViewerState() {
  const [state, setState] = createSignal<ViewerStatus>(
    { phase: 'loading', message: 'Loading document…' },
    { ownedWrite: true }
  );

  const [dragging, setDragging] = createSignal(false, { ownedWrite: true });
  const [autoZoom, setAutoZoom] = createSignal(false, { ownedWrite: true });
  const [vectorOnly, setVectorOnly] = createSignal(false);
  const [grids, setGrids] = createSignal(false);

  const [overviewRequest, setOverviewRequest] = createSignal(0);
  /** Requests a one-shot fit without reloading the document or retaining its camera. */
  const showOverview = () => {
    setAutoZoom(false);
    setOverviewRequest((request) => request + 1);
  };

  return {
    overviewRequest,
    showOverview,
    state,
    setState,
    dragging,
    setDragging,
    autoZoom,
    setAutoZoom,
    vectorOnly,
    setVectorOnly,
    grids,
    setGrids
  };
}

/** Reactive options and progress for one viewer. */
export type ViewerState = ReturnType<typeof createViewerState>;

/** User-visible progress and terminal GPU or loading errors. */
export type ViewerStatus =
  | { phase: 'loading' | 'preparing'; message: string }
  | { phase: 'ready'; message: string; resourceBytes?: number; preparationMs?: number }
  | { phase: 'error'; message: string; error: Exclude<ViewerError, { kind: 'aborted' }> };
