import { createSignal } from 'solid-js';
import { createImmediateSignal } from '../../shared/createImmediateSignal';

/**
 * Developer switches. The pen latency switches (prediction, ink trail, GPU warm-up) are remembered in `localStorage`,
 * so each device keeps what was chosen on it; missing or invalid stored values take their defaults, and storage
 * failures keep the choices for this session. The other switches last for this session; a reload restores their
 * defaults. The engine receives the wireframe, live tail and adaptive quality switches; the canvas input reads the pen
 * cursor and pen latency switches; the performance monitor starts enabled when the URL has a `performance` query
 * parameter.
 */
export function createDeveloperSettings() {
  const [debug, setDebug] = createSignal(false);
  const [liveTail, setLiveTail] = createSignal(true);
  const [adaptiveQuality, setAdaptiveQuality] = createSignal(true);
  const [showPenCursor, setShowPenCursor] = createSignal(false);
  const [, setLatency, latency] = createImmediateSignal(readPenLatency());
  const [rawReceived, setRawReceived] = createSignal(false);
  const [performanceMonitor, setPerformanceMonitor] = createSignal(
    new URL(location.href).searchParams.has('performance')
  );
  /** Changes pen latency switches and remembers them. */
  const rememberLatency = (patch: Partial<PenLatency>) => {
    const next = { ...latency(), ...patch };
    setLatency(next);
    try {
      localStorage.setItem(penLatencyKey, JSON.stringify(next));
    } catch {
      // Keep the choices for this session.
    }
  };

  return {
    /** Canvas wireframe with tile, page and cache statistics, and the palm rejection zone with ignored touches. */
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
    /**
     * Strokes run ahead along the points the browser predicts for the pen; off by default, since the line overshoots
     * where the pen stops sharply. Remembered on this device.
     */
    predictStrokes: () => latency().predict,
    setPredictStrokes: (predict: boolean) => rememberLatency({ predict }),
    /** The browser's compositor extends strokes to the pen between engine frames; off by default. Remembered. */
    inkTrail: () => latency().inkTrail,
    setInkTrail: (inkTrail: boolean) => rememberLatency({ inkTrail }),
    /** A hovering pen keeps the GPU clock up for the coming stroke; on by default. Remembered. */
    warmGpu: () => latency().warmGpu,
    setWarmGpu: (warmGpu: boolean) => rememberLatency({ warmGpu }),
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

/** The pen latency switches as stored. */
type PenLatency = { predict: boolean; inkTrail: boolean; warmGpu: boolean };

/** The pen latency switches before they are changed on a device. */
const defaultPenLatency: PenLatency = { predict: false, inkTrail: false, warmGpu: true };

function readPenLatency(): PenLatency {
  try {
    const stored = JSON.parse(localStorage.getItem(penLatencyKey) ?? '{}') as Partial<
      Record<keyof PenLatency, unknown>
    >;
    return {
      predict: typeof stored.predict === 'boolean' ? stored.predict : defaultPenLatency.predict,
      inkTrail: typeof stored.inkTrail === 'boolean' ? stored.inkTrail : defaultPenLatency.inkTrail,
      warmGpu: typeof stored.warmGpu === 'boolean' ? stored.warmGpu : defaultPenLatency.warmGpu
    };
  } catch {
    return defaultPenLatency;
  }
}

const penLatencyKey = 'paint.penLatency';
