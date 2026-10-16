import type { Brush } from '@app-game/paint-core/brush';
import {
  applyPressureCurve,
  identityPressureCurve,
  isIdentityPressureCurve,
  normalizePressureCurve,
  type PressureCurve
} from '@app-game/paint-core/pressureCurve';
import { defaultStrokeSettings } from '@app-game/paint-core/strokeSettings';
import { createSignal } from 'solid-js';

/**
 * The pen's pressure curve on this device, remembered in `localStorage` under `paint.pressureCalibration` with the
 * date and the browser's user agent. `mapPressure` is meant for `attachInput`: it maps raw pen pressure through the
 * saved curve before every stroke processor and brush engine, so it acts on every brush alike. Without a calibration
 * pressure is unchanged. Presets and documents never carry the curve: each browser on each device keeps its own.
 * `strokeBrush` keeps a brush's default pressure range from narrowing the calibrated pressure a second time.
 * Storage failures keep the curve for this session.
 */
export function createPressureCalibration() {
  /** The latest write, readable at once: a signal shows writes to readers only at its next flush. */
  let latest = read();
  const [savedSignal, setSavedSignal] = createSignal<SavedPressureCalibration | undefined>(latest);
  const saved = () => {
    savedSignal();
    return latest;
  };
  const setSaved = (next: SavedPressureCalibration | undefined) => {
    latest = next;
    setSavedSignal(() => next);
  };

  return {
    /** The saved calibration, or `undefined` while pressure is unchanged. */
    calibration: saved,
    /** The curve strokes use: the saved one, or the identity curve. */
    curve: () => saved()?.curve ?? identityPressureCurve,
    /** Raw pen pressure through the saved curve; for `attachInput`'s `mapPressure`. */
    mapPressure(raw: number) {
      const current = saved();
      return current ? applyPressureCurve(current.curve, raw) : raw;
    },
    /**
     * `brush` as its strokes should receive it. While the pen is calibrated, a brush pressure curve left at its
     * defaults (minimum 5%, maximum 80%, firmness 100%, Leonardo's values, applied by the normal, smooth and
     * stabilizer modes) becomes linear, 0% to 100%, so only the calibration shapes pressure; a curve the user changed
     * stays. The brush is returned unchanged otherwise. `calibrated` overrides whether the pen counts as calibrated,
     * for previewing a curve before it is saved.
     *
     * The user's decision (2026-10-10): the defaults would narrow calibrated pressure a second time. Applied as a
     * stroke is sent, so presets and the brush panel keep their values. Only presets saved with a curve of their own
     * and changes made on the fly differ from the defaults: the built-in Soft round and Eraser keep them, and ABR
     * imports carry no stroke settings.
     */
    strokeBrush(brush: Brush, calibrated = !!saved()): Brush {
      const { minimum, maximum, firmness } = defaultStrokeSettings();
      const stroke = brush.stroke;
      if (!calibrated || stroke.minimum !== minimum || stroke.maximum !== maximum || stroke.firmness !== firmness) {
        return brush;
      }

      return { ...brush, stroke: { ...stroke, minimum: 0, maximum: 1 } };
    },
    /** Saves `curve` for every later stroke; the identity curve removes the calibration, as `reset` does. */
    save(curve: PressureCurve) {
      const normalized = normalizePressureCurve(curve);
      if (isIdentityPressureCurve(normalized)) {
        reset();
        return;
      }

      const next: SavedPressureCalibration = {
        curve: normalized,
        date: new Date().toISOString(),
        userAgent: navigator.userAgent
      };
      setSaved(next);
      try {
        localStorage.setItem(storageKey, JSON.stringify({ version: 2, ...next }));
      } catch {
        // Keep the curve for this session.
      }
    },
    /** Forgets the calibration: pressure reaches brushes unchanged again. */
    reset
  };

  function reset() {
    setSaved(undefined);
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // Forgotten for this session.
    }
  }
}

/** A saved calibration: the curve, when it was made (ISO 8601) and in which browser. */
export type SavedPressureCalibration = { curve: PressureCurve; date: string; userAgent: string };

/**
 * The stored calibration. Version 2 keeps the curve's points; version 1 (2026-10-10) kept three raw pressures giving
 * zero, one half and full pressure, which become the same three points.
 */
function read(): SavedPressureCalibration | undefined {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as unknown;
    if (!stored || typeof stored !== 'object' || !('version' in stored)) {
      return undefined;
    }

    const { curve, date, userAgent } = stored as Partial<Record<keyof SavedPressureCalibration, unknown>>;
    const normalized =
      stored.version === 2 ? normalizePressureCurve(curve) : stored.version === 1 ? fromRange(curve) : undefined;
    if (!normalized || isIdentityPressureCurve(normalized)) {
      return undefined;
    }

    return {
      curve: normalized,
      date: typeof date === 'string' ? date : '',
      userAgent: typeof userAgent === 'string' ? userAgent : ''
    };
  } catch {
    return undefined;
  }
}

/** A version 1 curve, `{ minimum, middle, maximum }`, as points; `undefined` when it is not one. */
function fromRange(curve: unknown) {
  const { minimum, middle, maximum } = (curve ?? {}) as Record<string, unknown>;
  if (![minimum, middle, maximum].every((value) => typeof value === 'number')) {
    return undefined;
  }

  return normalizePressureCurve({
    points: [
      { x: minimum, y: 0 },
      { x: middle, y: 0.5 },
      { x: maximum, y: 1 }
    ]
  });
}

const storageKey = 'paint.pressureCalibration';
