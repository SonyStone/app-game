import { createMemo, createSignal, type Accessor } from 'solid-js';
import type { GpuError, ViewerError } from '../../shared/errors';
import type { DocumentSource } from '../document/createDocumentSource';
import type { DocumentProgress } from '../document/documentProgress';
import type { DocumentRendererProvider } from '../document/rendering/DocumentRendererProvider';

/**
 * Derives display status from independent GPU, source and preparation state.
 * Changing selection resets preparation, including reopening the same file. GPU failures persist.
 * Requires the source's owner; async source results are observed without suspending the status UI.
 */
export function createViewerStatus(source: DocumentSource, selection: Accessor<unknown>) {
  const [gpuError, setGpuError] = createSignal<GpuError | undefined>(undefined, { ownedWrite: true });
  type ReadyInfo = Parameters<NonNullable<Parameters<typeof DocumentRendererProvider>[0]['onReady']>>[0];
  const [preparation, setPreparation] = createSignal<ReadyInfo | undefined>(
    () => {
      selection();
      return undefined;
    },
    { ownedWrite: true }
  );
  const error = createMemo(() => gpuError() ?? source.error());

  const status = createMemo<ViewerStatus>(() => {
    const failure = error();
    if (failure) {
      return { phase: 'error', error: failure };
    }

    if (!source.active()) {
      return { phase: 'cancelled' };
    }

    const ready = preparation();
    if (ready) {
      return { phase: 'ready', ...ready };
    }

    if (source.ready()) {
      return { phase: 'preparing', progress: { stage: 'preparingGraphics' } };
    }
    return { phase: 'loading', progress: source.progress() };
  });

  const isBusy = createMemo(() => status().phase === 'loading' || status().phase === 'preparing');
  const progress = createMemo(() => {
    const current = status();
    return current.phase === 'loading' || current.phase === 'preparing' ? current.progress : undefined;
  });
  const percent = createMemo(() => {
    const value = progress();
    return value?.total && value.completed !== undefined
      ? Math.min(100, Math.floor((100 * value.completed) / value.total))
      : undefined;
  });

  return {
    /** Current display phase: error, cancelled, ready, preparing or loading with progress. */
    status,
    /** Terminal GPU failure, else the source's loading failure; GPU failures take precedence. */
    error,
    /** Whether the document is loading or preparing graphics. */
    isBusy,
    /** Loading or preparation progress while busy; undefined otherwise. */
    progress,
    /** Whole progress percentage in 0-100 when the total is known; undefined otherwise. */
    percent,
    /** Whether the renderer reported the current document as prepared. */
    isReady: createMemo(() => status().phase === 'ready'),
    /** Records a terminal failure of the shared GPU root or canvas; selecting another file cannot clear it. */
    reportGpuError(error: GpuError) {
      setGpuError(error);
      return null;
    },
    /** Captures a document lifetime. Late callbacks after replacement, cancellation or failure are ignored. */
    rendererCallbacks(signal: AbortSignal) {
      return {
        onReady(info: ReadyInfo) {
          if (!signal.aborted) {
            setPreparation(info);
          }
        },
        onResourceUsage(resourceBytes: number) {
          if (!signal.aborted) {
            setPreparation((current) => current && { ...current, resourceBytes });
          }
        }
      };
    }
  };
}

/** User-visible progress and terminal GPU or loading errors. */
export type ViewerStatus =
  | { phase: 'loading' | 'preparing'; progress?: DocumentProgress }
  | { phase: 'cancelled' }
  | { phase: 'ready'; resourceBytes: number; preparationMs: number }
  | { phase: 'error'; error: Exclude<ViewerError, { kind: 'aborted' }> };
