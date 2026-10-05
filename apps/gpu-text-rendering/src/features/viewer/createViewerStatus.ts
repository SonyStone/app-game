import type { GpuError } from '@app-game/solid-gpu/errors';
import { createMemo, createSignal } from 'solid-js';
import type { ViewerError } from '../../shared/errors';
import type { DocumentSource } from '../document/createDocumentSource';
import type { DocumentProgress } from '../document/documentProgress';
import type { DocumentRenderer } from '../document/rendering/DocumentRenderer';

/**
 * Derives display status from independent GPU, source and preparation state.
 * Each prepared document resets renderer preparation, including a reopened file. GPU failures persist.
 * Requires the source's owner.
 */
export function createViewerStatus(source: DocumentSource) {
  const [gpuError, setGpuError] = createSignal<GpuError | undefined>(undefined, { ownedWrite: true });
  type ReadyInfo = Parameters<NonNullable<Parameters<typeof DocumentRenderer>[0]['onReady']>>[0];
  const [preparation, setPreparation] = createSignal<ReadyInfo | undefined>(
    () => {
      source.prepared();
      return undefined;
    },
    { ownedWrite: true }
  );
  // GPU failures take precedence over the source's loading failure.
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
    /** Whether the document is loading or preparing graphics. */
    isBusy,
    /** Whole progress percentage in 0-100 when the total is known; undefined otherwise. */
    percent,
    /** Whether the renderer reported the current document as prepared. */
    isReady: createMemo(() => status().phase === 'ready'),
    /** Records a terminal failure of the shared GPU root or canvas; selecting another file cannot clear it. */
    reportGpuError(error: GpuError) {
      setGpuError(error);
      return null;
    },
    /**
     * Records the current renderer's successful preparation. DocumentRenderer stops reporting once its
     * document is replaced, cancelled or failed, and error/cancelled phases outrank ready.
     */
    reportReady(info: ReadyInfo) {
      setPreparation(info);
    },
    /** Updates the ready renderer's GPU residency; ignored before readiness. */
    reportResourceUsage(resourceBytes: number) {
      setPreparation((current) => current && { ...current, resourceBytes });
    }
  };
}

/** User-visible progress and terminal GPU or loading errors. */
export type ViewerStatus =
  | { phase: 'loading' | 'preparing'; progress?: DocumentProgress }
  | { phase: 'cancelled' }
  | { phase: 'ready'; resourceBytes: number; preparationMs: number }
  | { phase: 'error'; error: Exclude<ViewerError, { kind: 'aborted' }> };
