import { BRUSH_SIZE_PRESETS } from '../../features/brush-size';

/**
 * A number the cluster edits with a capsule or a pill, in the unit it shows: a range, the unit, whether the range is
 * best covered geometrically (`scale: 'log'`, for sizes and spacing), and good values to step through with taps and
 * the wheel.
 */
export type NumberSetting = {
  label: string;
  min: number;
  max: number;
  unit: string;
  scale?: 'log';
  presets: readonly number[];
};

/** A value as the cluster prints it: one decimal below 10, whole numbers above, without the unit. */
export function formatValue(value: number) {
  return Math.abs(value) < 10 && !Number.isInteger(value) ? `${Math.round(value * 10) / 10}` : `${Math.round(value)}`;
}

/**
 * Where a value lies in its range, 0–1: geometrically for `scale: 'log'` settings, so that each doubling of a size
 * takes the same distance on a capsule, linearly otherwise. Values outside the range count as its ends.
 */
export function fractionOf(setting: NumberSetting, value: number) {
  const clamped = Math.min(setting.max, Math.max(setting.min, value));
  if (setting.scale === 'log') {
    return Math.log(clamped / setting.min) / Math.log(setting.max / setting.min);
  }

  return (clamped - setting.min) / (setting.max - setting.min);
}

/** The value at a fraction 0–1 of the range; the inverse of `fractionOf`, rounded as `roundValue` does. */
export function valueAt(setting: NumberSetting, fraction: number) {
  const t = Math.min(1, Math.max(0, fraction));
  const raw =
    setting.scale === 'log'
      ? setting.min * (setting.max / setting.min) ** t
      : setting.min + (setting.max - setting.min) * t;
  return Math.min(setting.max, Math.max(setting.min, roundValue(raw)));
}

/** Rounds a value as the cluster shows it: tenths below 10, whole numbers above. */
export function roundValue(value: number) {
  return Math.abs(value) < 10 ? Math.round(value * 10) / 10 : Math.round(value);
}

/**
 * The preset `steps` stops away from `value` (negative steps go down), for taps and the wheel. A value between
 * presets first moves to the neighbouring preset in that direction; the ends stay where they are.
 */
export function stepPreset(setting: NumberSetting, value: number, steps: number) {
  const { presets } = setting;
  if (steps === 0 || presets.length === 0) {
    return value;
  }

  let index: number;
  if (steps > 0) {
    index = presets.findIndex((preset) => preset > value + 1e-9);
    index = index < 0 ? presets.length - 1 : index + steps - 1;
  } else {
    index = presets.findLastIndex((preset) => preset < value - 1e-9);
    index = index < 0 ? 0 : index + steps + 1;
  }

  return presets[Math.min(presets.length - 1, Math.max(0, index))]!;
}

/** A percentage from `min` to 100 with the usual stops, such as opacity. */
export function percentSetting(label: string, min = 0): NumberSetting {
  return {
    label,
    min,
    max: 100,
    unit: '%',
    presets: [min, 5, 10, 15, 20, 25, 30, 40, 50, 60, 70, 75, 80, 85, 90, 95, 100].filter(
      (value, index, all) => value >= min && all.indexOf(value) === index
    )
  };
}

/** The brush size in pixels up to `max` (512 for round brushes, 5000 for ABR presets), with CLIP STUDIO's stops. */
export function sizeSetting(max: number): NumberSetting {
  return {
    label: 'Size',
    min: 1,
    max,
    unit: 'px',
    scale: 'log',
    presets: [...BRUSH_SIZE_PRESETS.filter((value) => value >= 1 && value <= max), ...(max > 2000 ? [3000, max] : [])]
  };
}
