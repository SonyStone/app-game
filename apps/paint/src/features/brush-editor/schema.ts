import { brushSizeCurve, brushSpacingCurve, type SliderCurve } from '@app-game/abr-brush/sliderCurves';
import { normalizeStrokeSettings } from '@app-game/paint-core/strokeSettings';
import { patchFormValues, writeHost } from '../brush-library/documentSettings';
import { maxBrushSize } from '../brush/createBrushTools';
import type { BrushView } from './brushView';
import {
  photoshopCategory,
  photoshopKeys,
  photoshopRows,
  photoshopSmoothingRow,
  photoshopTipRow,
  statuses,
  tipKinds,
  toolApplies
} from './photoshopGroups';
import { maxSmoothing, smoothingLevel, steadySmoothing, withSmoothing } from './smoothing';

/**
 * The brush studio's one registry of settings, for every brush: Paint's own settings and the Photoshop groups, each
 * row reading the brush's document (`BrushView`) and writing by returning the document's next text. A setting both
 * kinds of brush have is one row with one place in the document (see `writeHost`); a Photoshop group a round brush
 * switches on moves it to the ABR renderer, which the resolver decides from the document alone.
 */
export const brushCategories: readonly BrushCategory[] = [
  {
    id: 'painting',
    label: 'Painting',
    group: 'basics',
    applies: always,
    status: (view) =>
      view.family === 'photoshop'
        ? statuses.tool(view.values)
        : `${Math.round(view.brush.size)} px · ${Math.round(view.brush.opacity * 100)}%`,
    settings: [
      number({
        id: 'size',
        label: 'Size',
        unit: 'px',
        min: () => 1,
        max: (view) => maxBrushSize(view.brush),
        curve: (view) => brushSizeCurve(maxBrushSize(view.brush)),
        read: (view) => view.brush.size,
        write: (view, size) => writeHost(view.text, 'size', size)
      }),
      ...photoshopRows('tool', ['mode']),
      { ...transfer('opacity', 'Opacity'), applies: (view) => toolApplies('opacity', view) },
      { ...transfer('flow', 'Flow'), applies: (view) => toolApplies('flow', view) },
      choice(
        'color-mixing',
        'Color mixing',
        [
          { value: 'linear', label: 'Smooth color' },
          { value: 'classic', label: 'Classic' }
        ],
        (view) => view.brush.mixing,
        (view, value) => writeHost(view.text, 'mixing', value === 'linear' ? 'linear' : 'classic')
      ),
      ...photoshopRows(
        'tool',
        photoshopKeys('tool').filter((key) => key !== 'mode')
      )
    ]
  },
  {
    id: 'brush-tip',
    label: 'Brush tip',
    group: 'basics',
    applies: always,
    status: (view) =>
      view.family === 'photoshop'
        ? `${tipKinds[view.values.tipKind] ?? 'Tip'} · ${Math.round(view.brush.size)} px`
        : view.values.tipKind === 'sampledBrush'
          ? `Sampled tip · ${Math.round(view.brush.spacing * 100)}%`
          : `Soft round · ${Math.round(view.brush.hardness * 100)}%`,
    settings: [
      { ...tipPercent('spacing', 'Spacing', 1, 1000), curve: () => brushSpacingCurve },
      photoshopTipRow('angle', 'Angle', -180, 180, '°'),
      photoshopTipRow('roundness', 'Roundness', 1, 100, '%'),
      { ...tipPercent('hardness', 'Hardness', 0, 100), applies: (view) => view.values.tipKind === 'computedBrush' }
    ]
  },
  photoshopCategory('shapeDynamics', 'Shape dynamics', 'basics', 'useShapeDynamics'),
  photoshopCategory('transfer', 'Transfer', 'basics', 'useTransfer'),
  photoshopCategory('scattering', 'Scattering', 'advanced', 'useScattering'),
  photoshopCategory('texture', 'Texture', 'advanced', 'useTexture', (view) => view.images.pattern),
  // A computed second tip is generated from its parameters; only a named sampled tip needs its stored image.
  photoshopCategory(
    'dualBrush',
    'Dual brush',
    'advanced',
    'useDualBrush',
    (view) => view.images.dual || !view.values.dualBrush.tipId
  ),
  photoshopCategory('colorDynamics', 'Color dynamics', 'advanced', 'useColorDynamics'),
  photoshopCategory('brushPose', 'Brush pose', 'advanced', 'useBrushPose'),
  strokeCorrection(),
  photoshopCategory('bristle', 'Bristle', 'advanced'),
  photoshopCategory('erodible', 'Erodible', 'advanced')
];

/**
 * Rows the studio once had under another ID, by the ID of the row that replaced them with the same meaning and
 * units. A Photoshop preset's Brush tip Size, Spacing and Hardness and its tool's Opacity and Flow became the rows
 * every brush shares (2026-11-19).
 */
export const replacedSettings: Readonly<Record<string, string>> = {
  'abr-tip-diameter': 'size',
  'abr-tip-spacing': 'spacing',
  'abr-tip-hardness': 'hardness',
  'abr-tool-opacity': 'opacity',
  'abr-tool-flow': 'flow'
};

/** Finds a setting by its stable ID, or by an ID it replaced (see {@link replacedSettings}). */
export function getBrushSetting(id: string): BrushSetting | undefined {
  const current = Object.hasOwn(replacedSettings, id) ? replacedSettings[id]! : id;
  return brushCategories.flatMap((category) => category.settings).find((setting) => setting.id === current);
}

/** The number settings among `settings`, in order. */
export function numberSettings(settings: readonly BrushSetting[]): NumberSetting[] {
  return settings.filter((setting) => setting.kind === 'number');
}

/** Shared metadata; applicability hides a row, while enabled only disables its control. */
export type SettingBase = {
  /** Stable, registry-wide identifier for standalone lookup, such as a part on the board. */
  id: string;
  /** Visible control label; inside a section, short and without the section's name, such as `Jitter`. */
  label: string;
  /**
   * Short heading of the sub-group the row belongs to, such as `Opacity`; rows without one stand alone. The rows of a
   * section are consecutive in their category.
   */
  section?: string;
  /** False removes this row because the brush cannot use it, as a Mixer's options on a brush. */
  applies: (view: BrushView) => boolean;
  /**
   * False keeps the row visible but greyed and disables interaction: whenever its value has no effect now, or its
   * group cannot be switched on because the brush lacks the image it needs.
   */
  enabled: (view: BrushView) => boolean;
};

/** Numeric values use UI units. Writes round to the nearest step, then clamp to the current bounds. */
export type NumberSetting = SettingBase & {
  kind: 'number';
  /** Display suffix without whitespace; empty for unitless levels. */
  unit: string;
  /** Inclusive lower bound in UI units, evaluated against the current document. */
  min: (view: BrushView) => number;
  /** Inclusive upper bound in UI units, evaluated against the current document. */
  max: (view: BrushView) => number;
  /** Rounding interval in UI units, anchored at zero as in BrushPanel. */
  step: number;
  /** Slider position mapping; omitted for a linear slider. */
  curve?: (view: BrushView) => SliderCurve;
  /** Current value in UI units, without rounding stored values. */
  read: (view: BrushView) => number;
  /**
   * The document's next text with `value` written; does not enforce applicability or enablement. NaN retains the
   * rounded current value.
   */
  write: (view: BrushView, value: number) => string;
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
  read: (view: BrushView) => boolean;
  /** The document's next text with the switch set. */
  write: (view: BrushView, on: boolean) => string;
};

/** Named options; writes reject values absent from options with a RangeError. */
export type ChoiceSetting = SettingBase & {
  kind: 'choice';
  /** Options in display order; values are the accepted write inputs. */
  options: readonly ChoiceOption[];
  /** Current option value. */
  read: (view: BrushView) => string;
  /** The document's next text with `value` chosen; throws RangeError for an unknown option. */
  write: (view: BrushView, value: string) => string;
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
  /** One-line summary derived from the current document. */
  status: (view: BrushView) => string;
  /** False hides the whole category, as Bristle for a brush without bristles. */
  applies: (view: BrushView) => boolean;
};

/**
 * Smoothing as one level, 0 to 22, with a tick per level and the strong levels above 15 marked; see `smoothingLevel`
 * for how it reads and writes the stroke's mode, and {@link brushSmoothing} for a brush drawn by the ABR renderer.
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
    write: (view, level) => writeHost(view.text, 'stroke', withSmoothing(view.brush.stroke, level))
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
      (view) => view.brush.stroke.catchUp,
      (view, catchUp) =>
        writeHost(view.text, 'stroke', withSmoothing({ ...view.brush.stroke, catchUp }, brushSmoothing(view)))
    ),
    enabled: (view) => brushSmoothing(view) > 0
  };
}

/**
 * Stroke correction: Paint's Smoothing level and catch-up, then the preset's own Photoshop smoothing. Paint's stroke
 * processor decides which applies (see `studioBrushRecipe`): above level 0 the stabilizer replaces the preset's
 * smoothing, whose rows are then greyed; at 0 a brush drawn by the ABR renderer smooths as its Photoshop smoothing
 * says, an Amount of 0 being none. A brush stored with raw input reads as level 0 and Amount 0, and a raised Amount
 * lets the preset smooth again. On a round brush, Photoshop smoothing starts off, and raising it moves the brush to the
 * ABR renderer as any Photoshop group does.
 */
function strokeCorrection(): BrushCategory {
  const level = smoothingSetting();
  const presetSmooths = (view: BrushView) => level.read(view) === 0 && view.brush.stroke.mode !== 'none';
  const amount = (view: BrushView) =>
    presetSmooths(view) && view.values.useSmoothing ? view.values.smoothing.amount : 0;
  const preset = (key: Parameters<typeof photoshopSmoothingRow>[0], label: string, catchUp = false): BrushSetting => ({
    ...photoshopSmoothingRow(key, label),
    enabled: (view) => amount(view) > 0 && !(catchUp && view.values.smoothing.pulledString)
  });

  return {
    id: 'stroke-correction',
    label: 'Stroke correction',
    group: 'advanced',
    applies: always,
    status: (view) => (level.read(view) > 0 ? String(level.read(view)) : amount(view) > 0 ? `${amount(view)}%` : 'Off'),
    settings: [
      level,
      catchUpSetting(),
      {
        id: 'abr-smoothing-amount',
        label: 'Amount',
        section: 'Photoshop smoothing',
        kind: 'number',
        unit: '%',
        min: () => 0,
        max: () => 100,
        step: 1,
        applies: always,
        enabled: (view) => level.read(view) === 0,
        read: amount,
        // Zero switches the preset's smoothing off and keeps its last amount, as Photoshop's own switch does; a raised
        // amount also leaves raw input for the preset's smoothing.
        write: (view, value) => {
          const next = Math.max(0, Math.min(100, Math.round(Number.isNaN(value) ? amount(view) : value)));
          const text =
            next > 0 && view.brush.stroke.mode === 'none'
              ? writeHost(view.text, 'stroke', normalizeStrokeSettings({ ...view.brush.stroke, mode: 'studio' }))
              : view.text;
          const current = view.values;
          return patchFormValues(text, {
            ...current,
            useSmoothing: next > 0,
            smoothing: { ...current.smoothing, amount: next > 0 ? next : current.smoothing.amount }
          });
        }
      },
      preset('pulledString', 'Pulled string'),
      preset('catchUp', 'Catch up', true),
      preset('catchUpAtEnd', 'Catch up at stroke end', true),
      preset('adjustForZoom', 'Adjust for zoom')
    ]
  };
}

/**
 * The brush's Smoothing level. A brush the ABR renderer draws smooths as its preset says in every mode but the
 * stabilizer and raw input (see `studioBrushRecipe`), so it reads as the stabilizer's level or 0.
 */
function brushSmoothing(view: BrushView) {
  const stroke = view.brush.stroke;
  return view.photoshopPath && stroke.mode !== 'stabilizer' ? 0 : smoothingLevel(stroke);
}

/**
 * The brush's stroke opacity or flow in percent, the board's Opacity and Flow too: one value in the document (see
 * `writeHost`), from 1% as the board's parts allow.
 */
function transfer(key: 'opacity' | 'flow', label: string): NumberSetting {
  return number({
    id: key,
    label,
    unit: '%',
    min: () => 1,
    max: () => 100,
    read: (view) => view.brush[key] * 100,
    write: (view, value) => writeHost(view.text, key, value / 100)
  });
}

/**
 * The primary tip's hardness or spacing in percent: one value in the document, the tip's hardness and the placement's
 * spacing, which a round document holds as fractions and a Photoshop document through its descriptor.
 */
function tipPercent(key: 'hardness' | 'spacing', label: string, min: number, max: number): NumberSetting {
  return number({
    id: key,
    label,
    unit: '%',
    min: () => min,
    max: () => max,
    read: (view) => (view.family === 'paint' ? view.brush[key] * 100 : view.values[key]),
    write: (view, value) =>
      view.family === 'paint'
        ? writeHost(view.text, key, value / 100)
        : patchFormValues(view.text, { ...view.values, [key]: value })
  });
}

function always() {
  return true;
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
    write: (view, value) =>
      config.write(
        view,
        Math.max(
          config.min(view),
          Math.min(config.max(view), Math.round((Number.isNaN(value) ? config.read(view) : value) / step) * step)
        )
      )
  };
}

function toggle(id: string, label: string, read: ToggleSetting['read'], write: ToggleSetting['write']): ToggleSetting {
  return { id, label, kind: 'toggle', applies: always, enabled: always, read, write };
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
    write: (view, value) => {
      if (!options.some((option) => option.value === value)) {
        throw new RangeError(`Unknown ${id} option: ${value}`);
      }

      return write(view, value);
    }
  };
}
