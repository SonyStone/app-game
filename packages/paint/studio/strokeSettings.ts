/** Stroke processing is captured at pen-down; Studio preserves the original quadratic smoothing. */
export type StrokeSettings = {
  mode: 'studio' | 'normal' | 'smooth';
  /** Leonardo's window is this setting plus one, capped at 50 samples. */
  normal: number;
  /** Independent window setting for smooth mode. */
  smooth: number;
  /** Smooth mode can leave the endpoint behind the pen; normal mode always catches up. */
  catchUp: boolean;
  /** Raw pressure mapped to zero, in [0, maximum). */
  minimum: number;
  /** Raw pressure mapped to one, in (minimum, 1]. */
  maximum: number;
  /** Positive exponent: above one requires firmer pressure, below one responds more softly. */
  firmness: number;
};

/** Research defaults are ready to try; the existing Studio mode remains selected initially. */
export function defaultStrokeSettings(): StrokeSettings {
  return { mode: 'studio', normal: 1, smooth: 10, catchUp: true, minimum: 0.05, maximum: 0.8, firmness: 1 };
}

/** Bounds UI/worker settings and guarantees a usable, increasing pressure range. */
export function normalizeStrokeSettings(settings: StrokeSettings): StrokeSettings {
  const minimum = bounded(settings.minimum, 0, 0.99, 0.05);
  return {
    mode: settings.mode === 'normal' || settings.mode === 'smooth' ? settings.mode : 'studio',
    normal: Math.round(bounded(settings.normal, 0, 49, 1)),
    smooth: Math.round(bounded(settings.smooth, 0, 49, 10)),
    catchUp: settings.catchUp !== false,
    minimum,
    maximum: bounded(settings.maximum, minimum + 0.01, 1, 0.8),
    firmness: bounded(settings.firmness, 0.1, 5, 1)
  };
}

function bounded(value: number, min: number, max: number, fallback: number): number {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : fallback));
}
