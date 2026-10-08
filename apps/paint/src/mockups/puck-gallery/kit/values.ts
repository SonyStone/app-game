import type { Setting } from './catalog';

/** A numeric setting from the catalog. */
export type NumberSetting = Extract<Setting, { kind: 'number' }>;

/** A value as panels print it: one decimal below 10, whole numbers above, without the unit. */
export function formatValue(value: number) {
  return Math.abs(value) < 10 && !Number.isInteger(value) ? `${Math.round(value * 10) / 10}` : `${Math.round(value)}`;
}

/**
 * Where a value lies in its range, 0–1: geometrically for `scale: 'log'` settings, so that each doubling of a size
 * takes the same distance on a dial or a strip, linearly otherwise.
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
  return roundValue(raw);
}

/** Rounds a value as editors show it: tenths below 10, whole numbers above. */
export function roundValue(value: number) {
  return Math.abs(value) < 10 ? Math.round(value * 10) / 10 : Math.round(value);
}

/**
 * The preset `steps` stops away from `value` (negative steps go down), for wheels, keys and detented dials. A value
 * between presets first moves to the neighbouring preset in that direction.
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

/** The index of the preset nearest to `value`, measured geometrically for log settings. */
export function nearestPreset(setting: NumberSetting, value: number) {
  const distance = (preset: number) =>
    setting.scale === 'log' && preset > 0 && value > 0 ? Math.abs(Math.log(preset / value)) : Math.abs(preset - value);
  return setting.presets.reduce(
    (best, preset, index) => (distance(preset) < distance(setting.presets[best]!) ? index : best),
    0
  );
}
