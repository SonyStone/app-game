import { maxStabilizerLevel, normalizeStrokeSettings, type StrokeSettings } from '@app-game/paint-core/strokeSettings';

/**
 * The brush studio's one Smoothing knob over the engine's stroke modes. Every mode but raw input averages the latest
 * pen samples and draws a curve through the averages, so a single level says how strongly: 0 is Studio's curve
 * through the pen's own points, without trailing, and 1 to {@link maxSmoothing} are the stabilizer's levels, whose
 * averages trail the pen further as the level grows. A brush stored with a Leonardo mode reads as the level whose
 * trailing is nearest its window's; raw input reads as 0. Only a write changes the stored mode.
 */
export function smoothingLevel(stroke: StrokeSettings): number {
  switch (stroke.mode) {
    case 'none':
    case 'studio':
      return 0;
    case 'stabilizer':
      return stroke.stabilizer;
    case 'normal':
      return levelForWindow(stroke.normal + 1);
    case 'smooth':
      return levelForWindow(stroke.smooth + 1);
  }
}

/**
 * `stroke` smoothing at `level`, rounded and clamped to 0 to {@link maxSmoothing}: Studio at 0, the stabilizer at that
 * level above it. The pressure curve and catch-up are kept, and so are the Leonardo windows, which no level uses.
 */
export function withSmoothing(stroke: StrokeSettings, level: number): StrokeSettings {
  const rounded = Math.max(0, Math.min(maxSmoothing, Math.round(Number.isFinite(level) ? level : 0)));

  return normalizeStrokeSettings(
    rounded === 0 ? { ...stroke, mode: 'studio' } : { ...stroke, mode: 'stabilizer', stabilizer: rounded }
  );
}

/** The strongest Smoothing level: the stabilizer's last, S-7. */
export const maxSmoothing = maxStabilizerLevel;

/** The last level that only averages more samples; the levels above it also average their own output and trail far. */
export const steadySmoothing = 15;

/**
 * How many pen samples Smoothing `level` trails behind a pen moving at a steady pace: an equal average of `n` samples
 * trails by `(n - 1) / 2`. Levels up to {@link steadySmoothing} average `level + 1` samples; the stabilizer's S-k
 * averages 15 and then averages that with its own latest `k` outputs, adding `k (k + 1) / 2`.
 */
export function smoothingTrail(level: number) {
  const strong = level - steadySmoothing;

  return strong <= 0 ? level / 2 : 7 + (strong * (strong + 1)) / 2;
}

/** The level whose trailing is nearest an equal average over `window` samples, the lower one on a tie. */
function levelForWindow(window: number) {
  const trail = (window - 1) / 2;
  let best = 0;
  for (let level = 1; level <= maxSmoothing; level++) {
    if (Math.abs(smoothingTrail(level) - trail) < Math.abs(smoothingTrail(best) - trail)) {
      best = level;
    }
  }

  return best;
}
