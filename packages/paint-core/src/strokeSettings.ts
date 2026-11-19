/** Stroke processing is captured at pen-down; Studio preserves the original quadratic smoothing. */
export type StrokeSettings = {
  mode: 'none' | 'studio' | 'normal' | 'smooth' | 'stabilizer';
  /** Leonardo's window is this setting plus one, capped at 50 samples. */
  normal: number;
  /** Independent window setting for smooth mode. */
  smooth: number;
  /**
   * Level of Paint Tool SAI's stabilizer: 0 to 15 average the latest 1 to 16 pen samples, 16 to 22 are S-1 to S-7,
   * which trail further; see `createStabilizerProcessor`.
   */
  stabilizer: number;
  /** Defaults to true. Smooth and stabilizer modes finish toward the lift point; false leaves their filtered endpoint. */
  catchUp: boolean;
};

/** Initial smoothing mode and independent filter levels. */
export function defaultStrokeSettings(): StrokeSettings {
  return {
    mode: 'studio',
    normal: 1,
    smooth: 10,
    stabilizer: 6,
    catchUp: true
  };
}

/** Bounds smoothing settings and drops unrecognized fields from older brushes. */
export function normalizeStrokeSettings(settings: StrokeSettings): StrokeSettings {
  return {
    mode: (['none', 'normal', 'smooth', 'stabilizer'] as const).find((mode) => mode === settings.mode) ?? 'studio',
    normal: Math.round(bounded(settings.normal, 0, 49, 1)),
    smooth: Math.round(bounded(settings.smooth, 0, 49, 10)),
    stabilizer: Math.round(bounded(settings.stabilizer, 0, maxStabilizerLevel, 6)),
    catchUp: settings.catchUp !== false
  };
}

function bounded(value: number, min: number, max: number, fallback: number): number {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : fallback));
}

/** Highest stabilizer level, S-7; see `StrokeSettings.stabilizer`. */
export const maxStabilizerLevel = 22;
