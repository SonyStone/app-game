import { brushFormSchema, brushToFormValues, formValuesToBrush, type BrushFormValues } from '@app-game/abr-brush/form';
import type { BrushAsset } from '@app-game/abr-brush/library';
import { brushPreviewResources } from '@app-game/abr-brush/resources';
import { featureFields, settingGroups, type SettingField } from '@app-game/abr-brush/settings-fields';
import type { AbrBrushSettings } from '@app-game/abr-paint/engine';
import type { Brush } from '@app-game/paint-core/brush';
import { normalizeStrokeSettings } from '@app-game/paint-core/strokeSettings';
import { brushCategories, catchUpSetting, smoothingSetting, type BrushCategory, type BrushSetting } from './schema';

// The tables below are declared before the categories, which read them while they are built.

/** Where a generated row goes: its field, its short label, its section, and a unit the descriptor lacks. */
type Placement = { key: string; label: string; section?: string; unit?: string };

/** Rows that stand alone, in order. */
function loose(...rows: [key: string, label: string, unit?: string][]): Placement[] {
  return rows.map(([key, label, unit]) => ({ key, label, unit }));
}

/** Rows under the heading `section`, in order. */
function section(section: string, ...rows: [key: string, label: string, unit?: string][]): Placement[] {
  return rows.map(([key, label, unit]) => ({ key, label, section, unit }));
}

/**
 * The rows of every generated group, in display order, with labels that do not repeat their section's heading. Each
 * dynamic reads Jitter, Control, Minimum, Fade length, as Photoshop's Brush Settings and the reference editor do.
 * Fields absent here are not shown: text and color fields, resource IDs, values stored only, and the tool's class.
 */
const layouts: Record<Exclude<Group, 'smoothing'>, readonly Placement[]> = {
  tool: [
    ...loose(['mode', 'Mode'], ['opacity', 'Opacity'], ['flow', 'Flow']),
    ...section(
      'Pen pressure',
      ['pressureOverridesOpacity', 'Always sets opacity'],
      ['pressureOverridesSize', 'Always sets size']
    ),
    ...section(
      'Tool options',
      ['strength', 'Strength'],
      ['fingerPainting', 'Finger painting'],
      ['smudgeAllLayers', 'Sample all layers'],
      ['wetness', 'Wet'],
      ['load', 'Load'],
      ['mix', 'Mix'],
      ['autoFill', 'Load after each stroke'],
      ['autoClean', 'Clean after each stroke'],
      ['sampleAllLayers', 'Sample all layers'],
      ['autoErase', 'Auto erase'],
      ['eraseToHistory', 'Erase to history'],
      ['eraserMode', 'Eraser mode'],
      ['sharpenAllLayers', 'Sample all layers'],
      ['protectDetail', 'Protect detail']
    )
  ],
  shapeDynamics: [
    ...section(
      'Size',
      ['sizeJitter', 'Jitter'],
      ['sizeControl', 'Control'],
      ['minimumDiameter', 'Minimum'],
      ['sizeFade', 'Fade length', 'marks'],
      ['tiltScale', 'Tilt scale'],
      ['sizeMinimum', 'Control minimum']
    ),
    ...section('Angle', ['angleJitter', 'Jitter'], ['angleControl', 'Control'], ['angleFade', 'Fade length', 'marks']),
    ...section(
      'Roundness',
      ['roundnessJitter', 'Jitter'],
      ['roundnessControl', 'Control'],
      ['roundnessMinimum', 'Minimum'],
      ['roundnessFade', 'Fade length', 'marks'],
      ['roundnessControlMinimum', 'Control minimum']
    ),
    ...section('Flip', ['flipXJitter', 'Random horizontal'], ['flipYJitter', 'Random vertical']),
    ...loose(['brushProjection', 'Brush projection'])
  ],
  transfer: (['opacity', 'flow', 'wetness', 'mix'] as const).flatMap((name) =>
    section(
      `${name[0]!.toUpperCase()}${name.slice(1)}`,
      [`${name}Jitter`, 'Jitter'],
      [`${name}Control`, 'Control'],
      [`${name}Minimum`, 'Minimum'],
      [`${name}Fade`, 'Fade length', 'marks']
    )
  ),
  scattering: [
    ...section(
      'Scatter',
      ['scatter', 'Amount'],
      ['bothAxes', 'Both axes'],
      ['control', 'Control'],
      ['fade', 'Fade length', 'marks']
    ),
    ...section(
      'Count',
      ['count', 'Tips'],
      ['countJitter', 'Jitter'],
      ['countControl', 'Control'],
      ['countFade', 'Fade length', 'marks']
    )
  ],
  texture: [
    ...section(
      'Pattern',
      ['scale', 'Scale'],
      ['brightness', 'Brightness'],
      ['contrast', 'Contrast'],
      ['invert', 'Invert']
    ),
    ...section(
      'Depth',
      ['mode', 'Mode'],
      ['depth', 'Depth'],
      ['eachTip', 'Vary per tip'],
      ['depthJitter', 'Jitter'],
      ['depthControl', 'Control'],
      ['minimumDepth', 'Minimum'],
      ['depthFade', 'Fade length', 'marks']
    )
  ],
  dualBrush: [
    ...loose(['mode', 'Mode'], ['flip', 'Random flip']),
    ...section(
      'Second tip',
      ['diameter', 'Size', 'px'],
      ['hardness', 'Hardness'],
      ['spacing', 'Spacing'],
      ['angle', 'Angle'],
      ['roundness', 'Roundness'],
      ['flipX', 'Flip horizontally'],
      ['flipY', 'Flip vertically']
    ),
    ...section('Scatter', ['scatter', 'Amount'], ['bothAxes', 'Both axes'], ['count', 'Tips'])
  ],
  colorDynamics: [
    ...loose(
      ['hueJitter', 'Hue jitter'],
      ['saturationJitter', 'Saturation jitter'],
      ['brightnessJitter', 'Brightness jitter'],
      ['purity', 'Purity'],
      ['applyPerTip', 'Apply per tip']
    ),
    ...section(
      'Foreground/background',
      ['foregroundBackgroundJitter', 'Jitter'],
      ['control', 'Control'],
      ['fade', 'Fade length', 'marks']
    )
  ],
  brushPose: [
    ...section(
      'Tilt',
      ['tiltX', 'X'],
      ['tiltY', 'Y'],
      ['overrideTiltX', 'Override pen X'],
      ['overrideTiltY', 'Override pen Y']
    ),
    ...section('Rotation', ['rotation', 'Angle', '°'], ['overrideRotation', 'Override pen']),
    ...section('Pressure', ['pressure', 'Amount'], ['overridePressure', 'Override pen'])
  ],
  bristle: loose(
    ['shape', 'Shape'],
    ['density', 'Bristles'],
    ['length', 'Length'],
    ['thickness', 'Thickness'],
    ['stiffness', 'Stiffness'],
    ['clumping', 'Clumping'],
    ['physics', 'Simulate bristle physics']
  ),
  erodible: loose(
    ['shape', 'Shape'],
    ['softness', 'Softness'],
    ['length', 'Length'],
    ['cutoff', 'Cutoff angle', '°'],
    ['granularity', 'Granularity'],
    ['streakiness', 'Spatter jitter'],
    ['splatSize', 'Spatter size'],
    ['splatCount', 'Spatter count']
  )
};

/**
 * When a row's value changes the stroke, beyond its group being on; rows absent here always do. Each rule follows
 * what `@app-game/abr-brush/stroke` reads: a Fade length only under Fade, a control's minimum only under a control
 * that has a range (Pen Tilt ignores the size control minimum, and only the sampled paintbrush tip reads it), Tilt
 * scale only under Pen Tilt, and per-tip texture depth only with Vary per tip. "Always use pressure" replaces the
 * size control and the whole opacity dynamic.
 */
const rules: Partial<Record<Exclude<Group, 'smoothing'>, Record<string, (v: BrushFormValues, b: Brush) => boolean>>> = {
  shapeDynamics: {
    sizeControl: (v) => !v.tool.pressureOverridesSize,
    sizeFade: (v) => sizeControl(v) === 1,
    minimumDiameter: (v) => sizeControl(v) !== 0 || v.shapeDynamics.sizeJitter > 0,
    tiltScale: (v) => sizeControl(v) === 3,
    sizeMinimum: (v) => sampledPaintbrush(v) && ranged(sizeControl(v)) && sizeControl(v) !== 3,
    angleFade: (v) => v.shapeDynamics.angleControl === 1,
    roundnessMinimum: (v) => ranged(v.shapeDynamics.roundnessControl) || v.shapeDynamics.roundnessJitter > 0,
    roundnessFade: (v) => v.shapeDynamics.roundnessControl === 1,
    roundnessControlMinimum: (v) => sampledPaintbrush(v) && ranged(v.shapeDynamics.roundnessControl)
  },
  transfer: Object.fromEntries(
    (['opacity', 'flow', 'wetness', 'mix'] as const).flatMap((name) => {
      const replaced = (v: BrushFormValues) => name === 'opacity' && v.tool.pressureOverridesOpacity;
      const control = (v: BrushFormValues) => v.transfer[`${name}Control`];
      return [
        [`${name}Jitter`, (v: BrushFormValues) => !replaced(v)],
        [`${name}Control`, (v: BrushFormValues) => !replaced(v)],
        [`${name}Minimum`, (v: BrushFormValues) => !replaced(v) && ranged(control(v))],
        [`${name}Fade`, (v: BrushFormValues) => !replaced(v) && control(v) === 1]
      ];
    })
  ),
  scattering: {
    control: (v) => v.scattering.scatter > 0,
    fade: (v) => v.scattering.scatter > 0 && v.scattering.control === 1,
    countFade: (v) => v.scattering.countControl === 1
  },
  texture: {
    depthJitter: (v) => v.texture.eachTip,
    depthControl: (v) => v.texture.eachTip,
    minimumDepth: (v) => v.texture.eachTip && (v.texture.depthControl !== 0 || v.texture.depthJitter > 0),
    depthFade: (v) => v.texture.eachTip && v.texture.depthControl === 1
  },
  colorDynamics: {
    fade: (v) => v.colorDynamics.control === 1
  }
};

/** Display units of the descriptor's unit IDs. */
const units: Record<string, string> = { '#Prc': '%', '#Ang': '°', '#Pxl': 'px' };

/**
 * The editor's categories for an ABR (Photoshop) brush, generated from the shared descriptor bindings in
 * `settingGroups`. Rows are grouped and labelled by {@link layouts}; a row is greyed while its value has no effect,
 * as the engine reads it (see {@link rules}). Smoothing joins Paint's Smoothing level with the preset's own smoothing,
 * the only two that change an ABR stroke, and Paint's pressure curve follows.
 */
export const abrCategories: readonly BrushCategory[] = [
  category('tool', 'Painting', 'basics'),
  {
    id: 'brush-tip',
    label: 'Brush tip',
    group: 'basics',
    applies: always,
    status: (b) => `${tipKinds[values(b).tipKind] ?? 'Tip'} · ${Math.round(b.size)} px`,
    settings: [
      rootNumber('diameter', 'Size', 1, 5000, 'px'),
      rootNumber('spacing', 'Spacing', 1, 1000, '%'),
      rootNumber('angle', 'Angle', -180, 180, '°'),
      rootNumber('roundness', 'Roundness', 1, 100, '%'),
      { ...rootNumber('hardness', 'Hardness', 0, 100, '%'), applies: (b) => values(b).tipKind === 'computedBrush' }
    ]
  },
  category('shapeDynamics', 'Shape dynamics', 'basics', 'useShapeDynamics'),
  category('transfer', 'Transfer', 'basics', 'useTransfer'),
  category('scattering', 'Scattering', 'advanced', 'useScattering'),
  category('texture', 'Texture', 'advanced', 'useTexture', (b) => !!settings(b).patternId),
  category('dualBrush', 'Dual brush', 'advanced', 'useDualBrush'),
  category('colorDynamics', 'Color dynamics', 'advanced', 'useColorDynamics'),
  category('brushPose', 'Brush pose', 'advanced', 'useBrushPose'),
  smoothingCategory(),
  category('bristle', 'Bristle', 'advanced'),
  category('erodible', 'Erodible', 'advanced'),
  brushCategories.find((category) => category.id === 'pressure-curve')!
];

/** Keeps texture availability tied to the source resource, even while the runtime texture is off. */
export function abrCategoriesFor(source: BrushAsset): readonly BrushCategory[] {
  const form = brushToFormValues(source);
  const hasPattern = !!brushPreviewResources(formValuesToBrush(source, { ...form, useTexture: true })).pattern;
  const texture = category('texture', 'Texture', 'advanced', 'useTexture', () => hasPattern);
  return abrCategories.map((category) =>
    category.id !== 'texture'
      ? category
      : {
          ...texture,
          status: (b) => (!values(b).useTexture ? 'Off' : hasPattern ? textureStatus(values(b)) : 'No embedded pattern')
        }
  );
}

/** Reads validated engine form values; only call for ABR brushes. */
export function abrValues(brush: Brush): BrushFormValues {
  return brushFormSchema.parse(settings(brush).values);
}

// Engine settings are validated when imported and every generated write preserves that shape.
function values(brush: Brush): BrushFormValues {
  return settings(brush).values;
}

type Group = keyof typeof settingGroups;
type Feature = keyof typeof featureFields;

/**
 * A generated category of the descriptor group `id`. With a `feature`, its switch comes first and every other row
 * is greyed while it is off; `gate` greys every row, the switch too, such as texture rows without a pattern.
 */
function category(
  id: Exclude<Group, 'smoothing'>,
  label: string,
  group: BrushCategory['group'],
  feature?: Feature,
  gate: (b: Brush) => boolean = always
): BrushCategory {
  return {
    id,
    label,
    group,
    applies: (b) =>
      id === 'bristle' ? values(b).tipKind === 'dBrush' : id === 'erodible' ? values(b).tipKind === 'dTips' : true,
    status: (b) =>
      feature && !values(b)[feature]
        ? 'Off'
        : id === 'texture' && !settings(b).patternId
          ? 'No embedded pattern'
          : statuses[id](values(b), b),
    settings: [
      ...(feature
        ? [
            {
              ...row(id, feature, featureFields[feature], { label: `Use ${label.toLowerCase()}` }, true),
              enabled: gate
            }
          ]
        : []),
      ...layouts[id].map((placement) => {
        const field = (settingGroups[id] as Record<string, SettingField>)[placement.key]!;
        const generated = row(id, placement.key, field, placement);
        const rule = rules[id]?.[placement.key] ?? always;
        return {
          ...generated,
          enabled: (b: Brush) => gate(b) && (!feature || values(b)[feature]) && rule(values(b), b)
        };
      })
    ]
  };
}

/** The size control the engine uses: "Always use pressure for size" replaces the preset's with Pen Pressure. */
function sizeControl(v: BrushFormValues) {
  return v.tool.pressureOverridesSize ? 2 : v.shapeDynamics.sizeControl;
}

/** Controls that map an input onto a range from a minimum: Fade, Pen Pressure, Pen Tilt, Stylus Wheel and Dial. */
function ranged(control: number) {
  return [1, 2, 3, 4, 8].includes(control);
}

/** The paintbrush with a sampled tip, the only primary that reads the size and roundness control minimums. */
function sampledPaintbrush(v: BrushFormValues) {
  return v.tool.type === 'PbTl' && v.tipKind === 'sampledBrush';
}

/** A generated row for `key` of `group`, or of the brush's root when `root`, placed and labelled by `placement`. */
function row(group: Group, key: string, field: SettingField, placement: Omit<Placement, 'key'>, root = false) {
  const read = (b: Brush): unknown =>
    root ? values(b)[key as Feature] : (values(b)[group] as Record<string, unknown>)[key];
  const write = (b: Brush, value: unknown): Partial<Brush> => {
    const current = values(b);
    const next = root ? { ...current, [key]: value } : { ...current, [group]: { ...current[group], [key]: value } };
    return { engine: { ...b.engine!, settings: { ...settings(b), values: next } } };
  };
  const base = {
    id: `abr-${group}-${key}`,
    label: placement.label,
    section: placement.section,
    applies: (b: Brush) => root || applicable(group, key, b),
    enabled: always
  };
  if (field.kind === 'boolean') {
    return { ...base, kind: 'toggle', read: (b) => Boolean(read(b)), write } satisfies BrushSetting;
  }

  if (field.options) {
    return {
      ...base,
      kind: 'choice',
      options: field.options.map((o) => ({ label: sentenceCase(o.label), value: String(o.value) })),
      read: (b) => String(read(b)),
      write: (b, value) => {
        const option = field.options!.find((o) => String(o.value) === value);
        if (!option) {
          throw new RangeError(`Unknown ${key}: ${value}`);
        }
        return write(b, option.value);
      }
    } satisfies BrushSetting;
  }

  return {
    ...base,
    kind: 'number',
    unit: placement.unit ?? units[field.unit ?? ''] ?? '',
    min: () => field.min ?? 0,
    max: () => field.max ?? 100,
    step: 1,
    read: (b) => Number(read(b)),
    write: (b, value) =>
      write(
        b,
        Math.max(field.min ?? 0, Math.min(field.max ?? 100, Math.round(Number.isNaN(value) ? Number(read(b)) : value)))
      )
  } satisfies BrushSetting;
}

/** Photoshop's option names, such as `Pen Pressure`, in the editor's sentence case: `Pen pressure`. */
function sentenceCase(label: string) {
  return label.charAt(0) + label.slice(1).toLowerCase();
}

function rootNumber(
  key: 'diameter' | 'spacing' | 'angle' | 'roundness' | 'hardness',
  label: string,
  min: number,
  max: number,
  unit: string
): BrushSetting {
  return {
    id: `abr-tip-${key}`,
    label,
    kind: 'number',
    unit,
    min: () => min,
    max: () => max,
    step: 1,
    applies: always,
    enabled: always,
    read: (b) => values(b)[key],
    write: (b, value) => ({
      engine: {
        ...b.engine!,
        settings: {
          ...settings(b),
          values: {
            ...values(b),
            [key]: Math.max(min, Math.min(max, Math.round(Number.isNaN(value) ? values(b)[key] : value)))
          }
        }
      }
    })
  };
}

/** Rows that apply to one tool class or tip variant only; other rows always apply. */
function applicable(group: Group, key: string, b: Brush) {
  const v = values(b);
  if (group === 'erodible') {
    return v.tipVariant === 0
      ? ['shape', 'softness', 'length'].includes(key)
      : ['cutoff', 'granularity', 'streakiness', 'splatSize', 'splatCount'].includes(key);
  }

  if (group === 'transfer' && /^(wetness|mix)/.test(key)) {
    return v.tool.type === 'MixB';
  }

  if (group === 'dualBrush' && key === 'hardness') {
    return !v.dualBrush.tipId;
  }

  if (group !== 'tool') {
    return true;
  }

  if (key === 'flow') {
    return (
      !['PcTl', 'SmTl', 'BlTl', 'ShTl'].includes(v.tool.type) && !(v.tool.type === 'ErTl' && v.tool.eraserMode !== 1)
    );
  }

  if (key === 'opacity') {
    return (
      !['MixB', 'SmTl', 'BlTl', 'ShTl'].includes(v.tool.type) && !(v.tool.type === 'ErTl' && v.tool.eraserMode === 3)
    );
  }

  const tools: Record<string, string[]> = {
    strength: ['SmTl', 'BlTl', 'ShTl'],
    fingerPainting: ['SmTl'],
    smudgeAllLayers: ['SmTl'],
    wetness: ['MixB'],
    load: ['MixB'],
    mix: ['MixB'],
    autoFill: ['MixB'],
    autoClean: ['MixB'],
    sampleAllLayers: ['MixB'],
    autoErase: ['PcTl'],
    eraseToHistory: ['ErTl'],
    eraserMode: ['ErTl'],
    sharpenAllLayers: ['ShTl', 'BlTl'],
    protectDetail: ['ShTl']
  };
  return !tools[key] || tools[key].includes(v.tool.type);
}

/**
 * One-line statuses of the generated groups while they are on. Each says what the group does now in at most about
 * 24 characters, so it fits the wide layout's column: the controls in use, or else the values that matter most.
 */
const statuses: Record<Exclude<Group, 'smoothing'>, (v: BrushFormValues, b: Brush) => string> = {
  tool: (v) => {
    const mode = settingGroups.tool.mode.options?.find((o) => o.value === v.tool.mode)?.label ?? 'Normal';
    return v.tool.mode === 'Nrml'
      ? `${v.tool.opacity}% · flow ${v.tool.flow}%`
      : `${sentenceCase(mode)} · ${v.tool.opacity}%`;
  },
  shapeDynamics: (v) =>
    dynamicsStatus(
      [
        ['Size', sizeControl(v), v.shapeDynamics.sizeJitter],
        ['Angle', v.shapeDynamics.angleControl, v.shapeDynamics.angleJitter],
        ['Roundness', v.shapeDynamics.roundnessControl, v.shapeDynamics.roundnessJitter]
      ],
      v.shapeDynamics.flipXJitter || v.shapeDynamics.flipYJitter ? 'Random flip' : 'No variation'
    ),
  transfer: (v) =>
    dynamicsStatus(
      [
        ['Opacity', v.tool.pressureOverridesOpacity ? 2 : v.transfer.opacityControl, v.transfer.opacityJitter],
        ['Flow', v.transfer.flowControl, v.transfer.flowJitter],
        ...(v.tool.type === 'MixB'
          ? ([
              ['Wetness', v.transfer.wetnessControl, v.transfer.wetnessJitter],
              ['Mix', v.transfer.mixControl, v.transfer.mixJitter]
            ] as const)
          : [])
      ],
      'No variation'
    ),
  scattering: (v) => `Spread ${v.scattering.scatter}% · ×${v.scattering.count}`,
  texture: textureStatus,
  dualBrush: (v) =>
    `${v.dualBrush.diameter} px · ${sentenceCase(settingGroups.dualBrush.mode.options?.find((o) => o.value === v.dualBrush.mode)?.label ?? '')}`,
  colorDynamics: (v) => {
    const c = v.colorDynamics;
    const parts = [
      c.control !== 0
        ? `FG/BG ${controlNames[c.control]}`
        : c.foregroundBackgroundJitter > 0
          ? `FG/BG ${c.foregroundBackgroundJitter}%`
          : '',
      c.hueJitter > 0 ? `Hue ${c.hueJitter}%` : '',
      c.saturationJitter > 0 ? `Sat. ${c.saturationJitter}%` : '',
      c.brightnessJitter > 0 ? `Bright. ${c.brightnessJitter}%` : '',
      c.purity !== 0 ? `Purity ${c.purity}%` : ''
    ].filter(Boolean);
    return firstTwo(parts, ' · ') || 'No variation';
  },
  brushPose: (v) => {
    const p = v.brushPose;
    const fixed = [
      p.overrideTiltX || p.overrideTiltY ? 'tilt' : '',
      p.overrideRotation ? 'rotation' : '',
      p.overridePressure ? 'pressure' : ''
    ].filter(Boolean);
    return fixed.length ? `Fixed ${firstTwo(fixed, ' + ')}` : "Pen's own pose";
  },
  bristle: (v) => `${v.bristle.density}% bristles`,
  erodible: (v) => (v.tipVariant === 0 ? `${v.erodible.softness}% softness` : `${v.erodible.splatCount} spatters`)
};

/** The texture's status: its depth and scale. */
function textureStatus(v: BrushFormValues) {
  return `Depth ${v.texture.depth}% · scale ${v.texture.scale}%`;
}

/**
 * A dynamic group's status: the controls in use, as "Pressure + Tilt"; without any, the jittered properties, as
 * "Size jitter 20%"; without either, `none`.
 */
function dynamicsStatus(entries: readonly (readonly [name: string, control: number, jitter: number])[], none: string) {
  const controls = [
    ...new Set(entries.filter(([, control]) => control !== 0).map(([, control]) => controlNames[control]))
  ];
  if (controls.length) {
    return firstTwo(controls as string[], ' + ');
  }

  const jittered = entries.filter(([, , jitter]) => jitter > 0);
  return jittered.length === 1
    ? `${jittered[0]![0]} jitter ${jittered[0]![2]}%`
    : jittered.length
      ? `Jitter: ${firstTwo(
          jittered.map(([name]) => name.toLowerCase()),
          ', '
        )}`
      : none;
}

/**
 * The first two of `parts`, joined, and how many more there are, as "Pressure + Tilt +1"; only the first when the
 * two would pass {@link statusLength}, as "Pressure +1".
 */
function firstTwo(parts: readonly string[], separator: string) {
  const two = parts.slice(0, 2).join(separator);
  const shown = parts.length > 1 && two.length > statusLength ? 1 : Math.min(2, parts.length);
  return parts.slice(0, shown).join(separator) + (parts.length > shown ? ` +${parts.length - shown}` : '');
}

/** The most characters of a status line that fit the wide layout's column at its font size. */
const statusLength = 22;

/** Short names of Photoshop's dynamics controls for statuses, by their descriptor values. */
const controlNames: Record<number, string> = {
  1: 'Fade',
  2: 'Pressure',
  3: 'Tilt',
  4: 'Wheel',
  5: 'Initial direction',
  6: 'Direction',
  7: 'Rotation',
  8: 'Dial'
};

const tipKinds: Record<string, string> = {
  sampledBrush: 'Sampled',
  computedBrush: 'Generated',
  dBrush: 'Bristle',
  dTips: 'Erodible'
};

/**
 * Smoothing of an ABR stroke: Paint's Smoothing level and catch-up, as for Paint's brushes, then the preset's own
 * Photoshop smoothing. Paint's stroke processor decides which applies (see `studioBrushRecipe`): above level 0 the
 * stabilizer replaces the preset's smoothing, whose rows are then greyed; at 0 the preset smooths as its Photoshop
 * smoothing says, an Amount of 0 being none. A brush stored with raw input reads as level 0 and Amount 0, and a
 * raised Amount lets the preset smooth again.
 */
function smoothingCategory(): BrushCategory {
  const level = smoothingSetting();
  const presetSmooths = (b: Brush) => level.read(b) === 0 && b.stroke.mode !== 'none';
  const amount = (b: Brush) => (presetSmooths(b) && values(b).useSmoothing ? values(b).smoothing.amount : 0);
  const preset = (key: keyof BrushFormValues['smoothing'], label: string, catchUp = false): BrushSetting => ({
    ...row('smoothing', key, settingGroups.smoothing[key], { label, section: 'Photoshop smoothing' }),
    enabled: (b) => amount(b) > 0 && !(catchUp && values(b).smoothing.pulledString)
  });

  return {
    id: 'smoothing',
    label: 'Smoothing',
    group: 'advanced',
    applies: always,
    status: (b) => (level.read(b) > 0 ? String(level.read(b)) : amount(b) > 0 ? `${amount(b)}%` : 'Off'),
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
        enabled: (b) => level.read(b) === 0,
        read: amount,
        // Zero switches the preset's smoothing off and keeps its last amount, as Photoshop's own switch does; a raised
        // amount also leaves raw input for the preset's smoothing.
        write: (b, value) => {
          const next = Math.max(0, Math.min(100, Math.round(Number.isNaN(value) ? amount(b) : value)));
          const current = values(b);
          return {
            ...(next > 0 && b.stroke.mode === 'none'
              ? { stroke: normalizeStrokeSettings({ ...b.stroke, mode: 'studio' }) }
              : {}),
            engine: {
              ...b.engine!,
              settings: {
                ...settings(b),
                values: {
                  ...current,
                  useSmoothing: next > 0,
                  smoothing: { ...current.smoothing, amount: next > 0 ? next : current.smoothing.amount }
                }
              }
            }
          };
        }
      },
      preset('pulledString', 'Pulled string'),
      preset('catchUp', 'Catch up', true),
      preset('catchUpAtEnd', 'Catch up at stroke end', true),
      preset('adjustForZoom', 'Adjust for zoom')
    ]
  };
}

function always() {
  return true;
}

/** ABR settings are validated at the engine boundary; callers restrict this adapter to that engine. */
function settings(brush: Brush): AbrBrushSettings {
  return brush.engine!.settings as AbrBrushSettings;
}
