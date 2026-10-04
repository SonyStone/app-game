import { defaultBrush, type Brush } from '@app-game/paint-core/brush';

/**
 * A named brush: its engine and the settings groups it carries, and the ids of the images its engine needs. The images
 * themselves load separately, only when the preset is used; see `BrushLibrary.resources`. Choosing a preset replaces
 * only the included groups; the brush keeps its current values for the others.
 */
export type BrushPreset = {
  id: string;
  name: string;
  /** Values of the included groups. `tip` is always included; a missing `engine` selects the round brush. */
  settings: Partial<Brush>;
  /** Ids of the tip, texture and dual-brush images that the engine settings refer to; uploaded before use. */
  resourceIds: readonly string[];
  /** Identifies an imported original, such as an ABR brush; importing the same original again replaces the preset. */
  source?: string;
  /** Ships with Paint: not stored, and cannot be renamed, overwritten or deleted. */
  builtIn?: boolean;
};

/**
 * Brush settings a preset can carry, by group. The user chooses groups when saving a preset; `tip` is always saved.
 * The engine and the brush `tool` identify the tip and are never edited on the fly.
 */
export const presetGroups = {
  tip: ['engine', 'tool', 'hardness', 'spacing'],
  size: ['size'],
  opacity: ['opacity', 'flow'],
  stroke: ['stroke', 'pressureSize', 'pressureFlow'],
  color: ['color', 'backgroundColor'],
  mixing: ['mixing']
} as const satisfies Record<string, readonly (keyof Brush)[]>;

/** A settings group of {@link presetGroups}. */
export type PresetGroup = keyof typeof presetGroups;

/** Groups saved by default: everything except colors, which stay with the user rather than the brush. */
export const defaultPresetGroups: readonly PresetGroup[] = ['tip', 'size', 'opacity', 'stroke', 'mixing'];

/** Copies the values of `groups` from `brush` into preset settings; the `tip` group is always included. */
export function presetSettings(brush: Brush, groups: readonly PresetGroup[]): Partial<Brush> {
  const keys = new Set<keyof Brush>(presetGroups.tip);
  for (const group of groups) {
    for (const key of presetGroups[group]) {
      keys.add(key);
    }
  }

  const settings: Partial<Brush> = {};
  for (const key of keys) {
    if (brush[key] !== undefined) {
      Object.assign(settings, { [key]: structuredClone(brush[key]) });
    }
  }

  return settings;
}

/**
 * Settings of `brush` that differ from the preset's saved values, limited to the groups the preset includes. `skip`
 * excludes keys the brush does not take from presets, such as the size while sizes are shared.
 */
export function presetChanges(preset: BrushPreset, brush: Brush, skip: readonly (keyof Brush)[] = []): Partial<Brush> {
  const changes: Partial<Brush> = {};
  for (const key of Object.keys(preset.settings) as (keyof Brush)[]) {
    if (fixedKeys.has(key) || skip.includes(key) || sameValue(brush[key], preset.settings[key])) {
      continue;
    }

    Object.assign(changes, { [key]: structuredClone(brush[key]) });
  }

  return changes;
}

/**
 * Applies a preset to the brush of a tool: the preset's engine and tool, its saved settings with the user's changes
 * on top, and the brush's current values for groups the preset does not include. `skip` keeps the brush's own values
 * for the listed keys.
 */
export function applyPreset(
  brush: Brush,
  preset: BrushPreset,
  changes: Partial<Brush> = {},
  skip: readonly (keyof Brush)[] = []
): Brush {
  const next: Brush = { ...brush, ...structuredClone(preset.settings), ...structuredClone(changes) };
  for (const key of skip) {
    Object.assign(next, { [key]: brush[key] });
  }

  next.engine = preset.settings.engine;
  next.tool = preset.settings.tool ?? 'brush';
  return next;
}

/** Presets that ship with Paint, before the user's own presets. */
export const builtInPresets: readonly BrushPreset[] = [
  {
    id: 'builtin:soft-round',
    name: 'Soft round',
    settings: presetSettings(defaultBrush(), defaultPresetGroups),
    resourceIds: [],
    builtIn: true
  },
  {
    id: 'builtin:eraser',
    name: 'Eraser',
    settings: presetSettings({ ...defaultBrush(), tool: 'eraser' }, defaultPresetGroups),
    resourceIds: [],
    builtIn: true
  }
];

/** Tip identity, replaced only by choosing another preset. */
const fixedKeys = new Set<keyof Brush>(['engine', 'tool']);

/** Structural equality of brush setting values: primitives, arrays and plain objects such as stroke settings. */
function sameValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }

  if (typeof left !== 'object' || typeof right !== 'object' || left === null || right === null) {
    return false;
  }

  if (Array.isArray(left) !== Array.isArray(right)) {
    return false;
  }

  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key) => sameValue((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]))
  );
}
