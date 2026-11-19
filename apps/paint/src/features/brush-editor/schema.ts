import { brushSizeCurve, brushSpacingCurve, type SliderCurve } from '@app-game/abr-brush/sliderCurves';
import type { Brush } from '@app-game/paint-core/brush';
import { normalizeStrokeSettings, type StrokeSettings } from '@app-game/paint-core/strokeSettings';
import { maxBrushSize } from '../brush/createBrushTools';
import { maxSmoothing, smoothingLevel, steadySmoothing, withSmoothing } from './smoothing';

/** Shared metadata; applicability hides a row, while enabled only disables its control. */
export type SettingBase = {
  /** Stable, schema-wide kebab-case identifier for standalone lookup. */
  id: string;
  /** Visible control label; inside a section, short and without the section's name, such as `Jitter`. */
  label: string;
  /**
   * Short heading of the sub-group the row belongs to, such as `Opacity`; rows without one stand alone. The rows of a
   * section are consecutive in their category.
   */
  section?: string;
  /** False removes this row because its brush engine cannot use it. */
  applies: (brush: Brush) => boolean;
  /** False keeps the row visible but greyed and disables interaction: whenever its value has no effect now. */
  enabled: (brush: Brush) => boolean;
};

/** Numeric values use UI units. Writes round to the nearest step, then clamp to the current bounds. */
export type NumberSetting = SettingBase & {
  kind: 'number';
  /** Display suffix without whitespace; empty for unitless levels. */
  unit: string;
  /** Inclusive lower bound in UI units, evaluated against current settings. */
  min: (brush: Brush) => number;
  /** Inclusive upper bound in UI units, evaluated against current settings. */
  max: (brush: Brush) => number;
  /** Rounding interval in UI units, anchored at zero as in BrushPanel. */
  step: number;
  /** Slider position mapping; omitted for a linear slider. */
  curve?: (brush: Brush) => SliderCurve;
  /** Current value in UI units, without rounding stored values. */
  read: (brush: Brush) => number;
  /** Returns a shallow-merge patch; does not enforce applicability or enablement. NaN retains the rounded current value. */
  write: (brush: Brush, value: number) => Partial<Brush>;
  /** Optional display text for a value; unit is rendered separately. */
  format?: (value: number) => string;
  /**
   * The value's named levels in order, for a setting with a few discrete steps, such as Smoothing's 0 to 22; a level's
   * `zone` groups it with its neighbours of the same zone, as the strong levels above 15. Controls that know levels
   * show them.
   */
  levels?: readonly { value: number; label: string; zone?: string }[];
};

/** Boolean brush control. Writes do not enforce applicability or enabled state. */
export type ToggleSetting = SettingBase & {
  kind: 'toggle';
  /** Current switch state, including when disabled or inapplicable. */
  read: (brush: Brush) => boolean;
  /** Returns a shallow-merge patch, normalizing any stroke settings it edits. */
  write: (brush: Brush, on: boolean) => Partial<Brush>;
};

/** Named options; writes reject values absent from options with a RangeError. */
export type ChoiceSetting = SettingBase & {
  kind: 'choice';
  /** Options in display order; values are the accepted write inputs. */
  options: readonly ChoiceOption[];
  /** Current option value. */
  read: (brush: Brush) => string;
  /** Returns a shallow-merge patch; throws RangeError for an unknown option. */
  write: (brush: Brush, value: string) => Partial<Brush>;
};

/** One option of a choice setting. */
export type ChoiceOption = {
  /** The value `read` returns and `write` accepts. */
  value: string;
  /** Visible option name. */
  label: string;
};

/** Discriminated control definition for generated editors and standalone controls. */
export type BrushSetting = NumberSetting | ToggleSetting | ChoiceSetting;

/** The number settings among `settings`, in order. */
export function numberSettings(settings: readonly BrushSetting[]): NumberSetting[] {
  return settings.filter((setting) => setting.kind === 'number');
}

/** Ordered editor section with a live summary. */
export type BrushCategory = {
  /** Stable navigation identifier. */
  id: string;
  /** Visible category name. */
  label: string;
  /** Navigation group; order follows brushCategories. */
  group: 'basics' | 'advanced';
  /** Rows in display order; consumers filter by each row's applies callback. */
  settings: readonly BrushSetting[];
  /** One-line summary derived from the current brush. */
  status: (brush: Brush) => string;
  /** False hides the whole category. */
  applies: (brush: Brush) => boolean;
};

/** Editor navigation and rows in display order. Callbacks are pure; writes return shallow-merge patches. */
export const brushCategories: readonly BrushCategory[] = [
  {
    id: 'painting',
    label: 'Painting',
    group: 'basics',
    applies: always,
    status: (b) => `${Math.round(b.size)} px · ${Math.round(b.opacity * 100)}%`,
    settings: [
      number({
        id: 'size',
        label: 'Size',
        unit: 'px',
        min: () => 1,
        max: maxBrushSize,
        curve: (b) => brushSizeCurve(maxBrushSize(b)),
        read: (b) => b.size,
        write: (_b, size) => ({ size })
      }),
      percent('opacity', 'Opacity', 1),
      percent('flow', 'Flow', 1),
      choice(
        'color-mixing',
        'Color mixing',
        [
          { value: 'linear', label: 'Smooth color' },
          { value: 'classic', label: 'Classic' }
        ],
        (b) => b.mixing,
        (_b, value) => ({ mixing: value === 'linear' ? 'linear' : 'classic' })
      )
    ]
  },
  {
    id: 'brush-tip',
    label: 'Brush tip',
    group: 'basics',
    // An ABR preset keeps its own tip, which its own editor's Brush tip edits.
    applies: (b) => b.engine?.id !== 'abr',
    status: (b) => {
      const name = tipLabels[b.engine?.id ?? 'round'] ?? 'Brush tip';
      const value = b.engine === undefined ? b.hardness : b.engine.id === 'textured' ? b.spacing : undefined;
      return value === undefined ? name : `${name} · ${Math.round(value * 100)}%`;
    },
    settings: [
      { ...percent('hardness', 'Hardness', 0), applies: (b) => b.engine === undefined },
      {
        ...percent('spacing', 'Tip spacing', 1, 1000),
        applies: (b) => b.engine?.id === 'textured',
        curve: () => brushSpacingCurve
      }
    ]
  },
  {
    id: 'dynamics',
    label: 'Dynamics',
    group: 'basics',
    applies: supportsPressure,
    status: (b) =>
      b.pressureSize
        ? b.pressureFlow
          ? 'Pressure → Size + Flow'
          : 'Pressure → Size'
        : b.pressureFlow
          ? 'Pressure → Flow'
          : 'Off',
    settings: [
      toggle(
        'pressure-size',
        'Pressure controls size',
        (b) => b.pressureSize,
        (_b, pressureSize) => ({ pressureSize }),
        supportsPressure
      ),
      toggle(
        'pressure-flow',
        'Pressure controls flow',
        (b) => b.pressureFlow,
        (_b, pressureFlow) => ({ pressureFlow }),
        supportsPressure
      )
    ]
  },
  {
    id: 'stroke-correction',
    label: 'Stroke correction',
    group: 'advanced',
    applies: always,
    status: (b) => {
      const level = brushSmoothing(b);
      return level === 0 ? 'Off' : String(level);
    },
    settings: [smoothingSetting(), catchUpSetting()]
  }
];

/**
 * The brush's own pressure range and firmness (`StrokeSettings.minimum`, `maximum` and `firmness`, Leonardo's power
 * curve), as a category the editors no longer show: the pen's pressure curve, one for every brush, replaced it in the
 * brush studio (2026-11-19). The engine still applies the three in the modes `calibratesPressure` names, and parts
 * stored on a board before keep editing them through these settings. While the pen is calibrated, the defaults
 * (5%, 80%, 100%) reach strokes as a straight 0% to 100% (see `createPressureCalibration`'s `strokeBrush`).
 */
export const legacyPressureCategory: BrushCategory = {
  id: 'pressure-curve',
  label: 'Pressure curve',
  group: 'advanced',
  applies: always,
  status: (b) =>
    calibratesPressure(b) ? `${Math.round(b.stroke.minimum * 100)}–${Math.round(b.stroke.maximum * 100)}%` : 'Off',
  settings: [
    strokePercent(
      'pressure-minimum',
      'Minimum',
      'minimum',
      () => 0,
      (b) => Math.round(b.stroke.maximum * 100) - 1
    ),
    strokePercent(
      'pressure-maximum',
      'Maximum',
      'maximum',
      (b) => Math.round(b.stroke.minimum * 100) + 1,
      () => 100
    ),
    strokePercent(
      'pressure-firmness',
      'Firmness',
      'firmness',
      () => 10,
      () => 500,
      5
    )
  ]
};

/**
 * Finds a setting regardless of the current engine or stroke mode, also one of {@link legacyPressureCategory}'s;
 * unknown IDs return undefined.
 */
export function getBrushSetting(id: string): BrushSetting | undefined {
  return [...brushCategories, legacyPressureCategory]
    .flatMap((category) => category.settings)
    .find((setting) => setting.id === id);
}

/**
 * Smoothing as one level, 0 to 22, with a tick per level and the strong levels above 15 marked; see `smoothingLevel`
 * for how it reads and writes the stroke's mode, and {@link brushSmoothing} for an ABR brush. Shared by Paint's Stroke
 * correction and ABR's Smoothing.
 */
export function smoothingSetting(): NumberSetting {
  return number({
    id: 'smoothing',
    label: 'Smoothing',
    unit: '',
    min: () => 0,
    max: () => maxSmoothing,
    levels: Array.from({ length: maxSmoothing + 1 }, (_, level) => ({
      value: level,
      label: String(level),
      zone: level > steadySmoothing ? 'strong' : undefined
    })),
    read: brushSmoothing,
    write: (b, level) => ({ stroke: withSmoothing(b.stroke, level) })
  });
}

/**
 * Whether the line finishes at the pen when it lifts, or stops where the smoothing has got to. Active while Smoothing
 * is above 0, the only levels that trail. A brush stored with a Leonardo mode becomes the stabilizer at its level as
 * it is switched, since Leonardo's normal mode always catches up.
 */
export function catchUpSetting(): ToggleSetting {
  return {
    ...toggle(
      'catch-up',
      'Catch up on pen lift',
      (b) => b.stroke.catchUp,
      (b, catchUp) => ({ stroke: withSmoothing({ ...b.stroke, catchUp }, brushSmoothing(b)) })
    ),
    enabled: (b) => brushSmoothing(b) > 0
  };
}

/**
 * The brush's Smoothing level. An ABR brush smooths as its preset says in every mode but the stabilizer and raw input
 * (see `studioBrushRecipe`), so it reads as the stabilizer's level or 0.
 */
function brushSmoothing(b: Brush) {
  return b.engine?.id === 'abr' && b.stroke.mode !== 'stabilizer' ? 0 : smoothingLevel(b.stroke);
}

/** Captures editable fields; opt into a detached ABR engine baseline for descriptor editing. */
export function snapshotBrushSettings(brush: Brush, includeAbrEngine = false) {
  const { size, opacity, flow, mixing, hardness, spacing, pressureSize, pressureFlow, stroke } = brush;
  return {
    size,
    opacity,
    flow,
    mixing,
    hardness,
    spacing,
    pressureSize,
    pressureFlow,
    stroke: { ...stroke },
    ...(includeAbrEngine && brush.engine?.id === 'abr' ? { engine: structuredClone(brush.engine) } : {})
  };
}

/** Shallow-merge to cancel edits; colors and tool are excluded, ABR engine capture is opt-in. */
export type BrushSettingsSnapshot = ReturnType<typeof snapshotBrushSettings>;

/** Compares editable values, including inactive settings retained for other engines and modes. */
export function brushSettingsDiffer(brush: Brush, snapshot: BrushSettingsSnapshot): boolean {
  const current = snapshotBrushSettings(brush, snapshot.engine !== undefined);
  return (Object.keys(current) as (keyof BrushSettingsSnapshot)[]).some((key) =>
    key === 'stroke'
      ? (Object.keys(current.stroke) as (keyof StrokeSettings)[]).some(
          (field) => current.stroke[field] !== snapshot.stroke[field]
        )
      : key === 'engine'
        ? JSON.stringify(current.engine) !== JSON.stringify(snapshot.engine)
        : current[key] !== snapshot[key]
  );
}

function always() {
  return true;
}

/** ABR presets carry their own pressure dynamics, so the pressure toggles do not apply to them. */
function supportsPressure(b: Brush) {
  return b.engine?.id !== 'abr';
}

/**
 * Whether the pen pressure range and firmness apply: in the stabilizer, and in the Leonardo modes except for an ABR
 * brush, whose preset smooths and passes the pen's pressure on unchanged there.
 */
function calibratesPressure(b: Brush) {
  const leonardo = b.stroke.mode === 'normal' || b.stroke.mode === 'smooth';
  return b.stroke.mode === 'stabilizer' || (leonardo && b.engine?.id !== 'abr');
}

/** Merges `patch` into the brush's stroke settings and normalizes the result, as every stroke write must. */
function strokePatch(b: Brush, patch: Partial<StrokeSettings>): Partial<Brush> {
  return { stroke: normalizeStrokeSettings({ ...b.stroke, ...patch }) };
}

/** NaN inputs retain the current value; availability remains the caller's responsibility. */
function number(
  config: Omit<NumberSetting, 'kind' | 'step' | 'applies' | 'enabled'> &
    Partial<Pick<NumberSetting, 'step' | 'applies' | 'enabled'>>
): NumberSetting {
  const step = config.step ?? 1;
  return {
    applies: always,
    enabled: always,
    ...config,
    kind: 'number',
    step,
    write: (b, value) =>
      config.write(
        b,
        Math.max(
          config.min(b),
          Math.min(config.max(b), Math.round((Number.isNaN(value) ? config.read(b) : value) / step) * step)
        )
      )
  };
}

/** A number setting stored as a 0–1 fraction of the brush and shown in percent. */
function percent(
  field: 'opacity' | 'flow' | 'hardness' | 'spacing',
  label: string,
  min: number,
  max = 100
): NumberSetting {
  return number({
    id: field,
    label,
    unit: '%',
    min: () => min,
    max: () => max,
    read: (b) => b[field] * 100,
    write: (_b, value) => ({ [field]: value / 100 })
  });
}

function toggle(
  id: string,
  label: string,
  read: ToggleSetting['read'],
  write: ToggleSetting['write'],
  applies: SettingBase['applies'] = always
): ToggleSetting {
  return { id, label, kind: 'toggle', applies, enabled: always, read, write };
}

/** A choice setting whose write rejects values that are not among `options`. */
function choice(
  id: string,
  label: string,
  options: ChoiceSetting['options'],
  read: ChoiceSetting['read'],
  write: ChoiceSetting['write']
): ChoiceSetting {
  return {
    id,
    label,
    kind: 'choice',
    applies: always,
    enabled: always,
    options,
    read,
    write: (b, value) => {
      if (!options.some((option) => option.value === value)) {
        throw new RangeError(`Unknown ${id} option: ${value}`);
      }

      return write(b, value);
    }
  };
}

/** A percent setting of the pen pressure range, enabled only in the modes that calibrate pressure. */
function strokePercent(
  id: string,
  label: string,
  field: 'minimum' | 'maximum' | 'firmness',
  min: NumberSetting['min'],
  max: NumberSetting['max'],
  step = 1
): NumberSetting {
  return number({
    id,
    label,
    unit: '%',
    min,
    max,
    step,
    enabled: calibratesPressure,
    read: (b) => b.stroke[field] * 100,
    write: (b, value) => strokePatch(b, { [field]: value / 100 })
  });
}

const tipLabels: Record<string, string> = { round: 'Soft round', textured: 'Textured tip', abr: 'ABR brush' };
