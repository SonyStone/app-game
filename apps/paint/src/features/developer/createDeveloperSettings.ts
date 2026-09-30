import { createSignal } from 'solid-js';

/**
 * Developer switches for this editor session; a reload restores the defaults. The engine receives the wireframe,
 * live tail and adaptive quality switches; the canvas input reads the pen cursor switch; the performance monitor
 * starts enabled when the URL has a `performance` query parameter.
 */
export function createDeveloperSettings() {
  const [debug, setDebug] = createSignal(false);
  const [liveTail, setLiveTail] = createSignal(true);
  const [adaptiveQuality, setAdaptiveQuality] = createSignal(true);
  const [showPenCursor, setShowPenCursor] = createSignal(false);
  const [rawReceived, setRawReceived] = createSignal(false);
  const [performanceMonitor, setPerformanceMonitor] = createSignal(
    new URL(location.href).searchParams.has('performance')
  );

  return {
    /** Canvas wireframe with tile, page and cache statistics. */
    debug,
    setDebug,
    /** Disposable preview of the stroke between the last sample and the pen. */
    liveTail,
    setLiveTail,
    /** Brushes may paint at the canvas level of detail to reduce work; on by default. */
    adaptiveQuality,
    setAdaptiveQuality,
    /** Keeps the pen cursor visible while drawing. */
    showPenCursor,
    setShowPenCursor,
    /** Frame-cost panel and reports of the drawing engine's frames. */
    performanceMonitor,
    setPerformanceMonitor,
    /** Raw pen updates have been received, not merely supported. */
    rawReceived,
    markRawReceived: () => setRawReceived(true)
  };
}

/** Developer switches and their setters. */
export type DeveloperSettings = ReturnType<typeof createDeveloperSettings>;
