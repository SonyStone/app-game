import type { BrushFormValues } from '@app-game/abr-brush/form';
import { featureFields, settingGroups, type SettingField } from '@app-game/abr-brush/settings-fields';
import { patchFormValues } from '../brush-library/documentSettings';
import type { BrushView } from './brushView';
import type { BrushCategory, BrushSetting } from './schema';

/**
 * The studio's Photoshop groups, generated from the shared descriptor bindings in `settingGroups`: each group's rows,
 * in the reference editor's order and labelled by {@link layouts}, read the document's Photoshop form values and write
 * them back through `patchFormValues`. Every brush shows them; on a Paint document they start switched off, and a
 * group switched on moves the brush to the ABR renderer. A row is greyed while its value has no effect, as the engine
 * reads it (see {@link rules}).
 */
export function photoshopCategory(
  id: Exclude<Group, 'smoothing' | 'tool'>,
  label: string,
  group: BrushCategory['group'],
  feature?: Feature,
  gate: (view: BrushView) => boolean = always
): BrushCategory {
  return {
    id,
    label,
    group,
    applies: (view) =>
      id === 'bristle' ? view.values.tipKind === 'dBrush' : id === 'erodible' ? view.values.tipKind === 'dTips' : true,
    // A missing image explains the greyed rows better than "Off", which it also causes.
    status: (view) =>
      !gate(view) ? missingImage(id).status : feature && !view.values[feature] ? 'Off' : statuses[id](view.values),
    ...(gate !== always && { note: (view: BrushView) => (gate(view) ? undefined : missingImage(id).note) }),
    settings: [
      ...(feature
        ? [
            {
              ...row(id, feature, featureFields[feature], { label: `Use ${label.toLowerCase()}` }, true),
              enabled: gate
            }
          ]
        : []),
      ...photoshopRows(id, undefined, (view) => gate(view) && (!feature || view.values[feature]))
    ]
  };
}

/**
 * What a group gated on an image the brush lacks says instead of its settings: its sidebar status and the note over its
 * greyed rows.
 */
function missingImage(id: string) {
  return id === 'texture'
    ? {
        status: 'No embedded pattern',
        note: 'This brush has no texture pattern of its own. Photoshop brushes with a texture bring theirs.'
      }
    : {
        status: 'No embedded second tip',
        note: 'This brush has no second tip image of its own. Photoshop brushes with a dual brush bring theirs.'
      };
}

/**
 * The generated rows of the group `id` in display order, only those whose fields are among `keys` when given; each is
 * greyed unless `active` and its own rule (see {@link rules}) hold.
 */
export function photoshopRows(
  id: Exclude<Group, 'smoothing'>,
  keys?: readonly string[],
  active: (view: BrushView) => boolean = always
): BrushSetting[] {
  return layouts[id]
    .filter((placement) => !keys || keys.includes(placement.key))
    .map((placement) => {
      const field = (settingGroups[id] as Record<string, SettingField>)[placement.key]!;
      const rule = rules[id]?.[placement.key] ?? always;
      return { ...row(id, placement.key, field, placement), enabled: (view) => active(view) && rule(view.values) };
    });
}

/** The fields of the group `id` that {@link photoshopRows} shows, in display order. */
export function photoshopKeys(id: Exclude<Group, 'smoothing'>) {
  return layouts[id].map((placement) => placement.key);
}

/**
 * The row of the Photoshop smoothing field `key`, labelled `label` under the heading "Photoshop smoothing"; see the
 * studio's Stroke correction.
 */
export function photoshopSmoothingRow(key: keyof BrushFormValues['smoothing'], label: string): BrushSetting {
  return row('smoothing', key, settingGroups.smoothing[key], { label, section: 'Photoshop smoothing' });
}

/**
 * The tip's own number field `key` of the form, as a Brush tip row. Angle is greyed while it has no effect: on a round
 * (computed) tip at 100% roundness, saying so (`disabledReason`).
 */
export function photoshopTipRow(
  key: 'angle' | 'roundness',
  label: string,
  min: number,
  max: number,
  unit: string
): BrushSetting {
  // A round tip at full roundness looks the same at every angle.
  const turnsNothing = (view: BrushView) =>
    key === 'angle' && view.values.tipKind === 'computedBrush' && view.values.roundness >= 100;
  return {
    id: `abr-tip-${key}`,
    label,
    kind: 'number',
    unit,
    min: () => min,
    max: () => max,
    step: 1,
    applies: always,
    enabled: (view) => !turnsNothing(view),
    ...(key === 'angle' && {
      disabledReason: (view: BrushView) =>
        turnsNothing(view) ? 'A round tip looks the same at every angle. Lower Roundness to use Angle.' : undefined
    }),
    read: (view) => view.values[key],
    write: (view, value) =>
      patchFormValues(view.text, {
        ...view.values,
        [key]: Math.max(min, Math.min(max, Math.round(Number.isNaN(value) ? view.values[key] : value)))
      })
  };
}

/** The descriptor's tip kinds by their short names, as Brush tip's status says them. */
export const tipKinds: Record<string, string> = {
  sampledBrush: 'Sampled',
  computedBrush: 'Generated',
  dBrush: 'Bristle',
  dTips: 'Erodible'
};

/** Whether the tool's own row `key` applies to the document's tool; see {@link applicable}. */
export function toolApplies(key: 'opacity' | 'flow', view: BrushView) {
  return applicable('tool', key, view.values);
}

/** Photoshop's option names, such as `Pen Pressure`, in the editor's sentence case: `Pen pressure`. */
export function sentenceCase(label: string) {
  return label.charAt(0) + label.slice(1).toLowerCase();
}

type Group = keyof typeof settingGroups;
type Feature = keyof typeof featureFields;

// The tables below are declared before they are read, while the categories are built.

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
    ...loose(['mode', 'Mode']),
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
const rules: Partial<Record<Exclude<Group, 'smoothing'>, Record<string, (v: BrushFormValues) => boolean>>> = {
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

/** A generated row for `key` of `group`, or of the form's root when `root`, placed and labelled by `placement`. */
function row(
  group: Group,
  key: string,
  field: SettingField,
  placement: Omit<Placement, 'key'>,
  root = false
): BrushSetting {
  const read = (view: BrushView): unknown =>
    root ? view.values[key as Feature] : (view.values[group] as Record<string, unknown>)[key];
  const write = (view: BrushView, value: unknown) => {
    const current = view.values;
    const next = root ? { ...current, [key]: value } : { ...current, [group]: { ...current[group], [key]: value } };
    return patchFormValues(view.text, next);
  };
  const base = {
    id: `abr-${group}-${key}`,
    label: placement.label,
    section: placement.section,
    applies: (view: BrushView) => root || applicable(group, key, view.values),
    enabled: always
  };
  if (field.kind === 'boolean') {
    return { ...base, kind: 'toggle', read: (view) => Boolean(read(view)), write };
  }

  if (field.options) {
    return {
      ...base,
      kind: 'choice',
      options: field.options.map((o) => ({ label: sentenceCase(o.label), value: String(o.value) })),
      read: (view) => String(read(view)),
      write: (view, value) => {
        const option = field.options!.find((o) => String(o.value) === value);
        if (!option) {
          throw new RangeError(`Unknown ${key}: ${value}`);
        }
        return write(view, option.value);
      }
    };
  }

  return {
    ...base,
    kind: 'number',
    unit: placement.unit ?? units[field.unit ?? ''] ?? '',
    min: () => field.min ?? 0,
    max: () => field.max ?? 100,
    step: 1,
    read: (view) => Number(read(view)),
    write: (view, value) =>
      write(
        view,
        Math.max(
          field.min ?? 0,
          Math.min(field.max ?? 100, Math.round(Number.isNaN(value) ? Number(read(view)) : value))
        )
      )
  };
}

/** Rows that apply to one tool class or tip variant only; other rows always apply. */
function applicable(group: Group, key: string, v: BrushFormValues) {
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
export const statuses: Record<Exclude<Group, 'smoothing'>, (v: BrushFormValues) => string> = {
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

function always() {
  return true;
}
