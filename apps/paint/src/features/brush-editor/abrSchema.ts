import { brushFormSchema, brushToFormValues, formValuesToBrush, type BrushFormValues } from '@app-game/abr-brush/form';
import type { BrushAsset } from '@app-game/abr-brush/library';
import { brushPreviewResources } from '@app-game/abr-brush/resources';
import { featureFields, settingGroups, type SettingField } from '@app-game/abr-brush/settings-fields';
import type { AbrBrushSettings } from '@app-game/abr-paint/engine';
import type { Brush } from '@app-game/paint-core/brush';
import { brushCategories, type BrushCategory, type BrushSetting } from './schema';

/** Generates ABR rows from the shared descriptor bindings. Paint-only stroke controls remain last. */
export const abrCategories: readonly BrushCategory[] = [
  category('tool', 'Painting', 'basics'),
  {
    id: 'brush-tip',
    label: 'Brush tip',
    group: 'basics',
    applies: always,
    status: (b) => `${values(b).tipKind === 'sampledBrush' ? 'Sampled' : 'Generated'} · ${Math.round(b.size)} px`,
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
  category('texture', 'Texture', 'advanced', 'useTexture'),
  category('dualBrush', 'Dual brush', 'advanced', 'useDualBrush'),
  category('colorDynamics', 'Colour dynamics', 'advanced', 'useColorDynamics'),
  category('brushPose', 'Brush pose', 'advanced', 'useBrushPose'),
  category('smoothing', 'Smoothing', 'advanced', 'useSmoothing'),
  category('bristle', 'Bristle', 'advanced'),
  category('erodible', 'Erodible', 'advanced'),
  ...brushCategories.filter((c) => c.id === 'stroke-correction' || c.id === 'pressure-curve')
];

/** Keeps texture availability tied to the source resource, even while the runtime texture is off. */
export function abrCategoriesFor(source: BrushAsset): readonly BrushCategory[] {
  const form = brushToFormValues(source);
  const hasPattern = !!brushPreviewResources(formValuesToBrush(source, { ...form, useTexture: true })).pattern;
  return abrCategories.map((category) =>
    category.id !== 'texture'
      ? category
      : {
          ...category,
          status: (b) =>
            !values(b).useTexture
              ? 'Off'
              : hasPattern
                ? `Depth ${values(b).texture.depth}% · ${values(b).texture.scale}% scale`
                : 'No embedded pattern',
          settings: category.settings.map((setting) => ({
            ...setting,
            enabled: (b: Brush) => hasPattern && (setting.id === 'abr-texture-useTexture' || values(b).useTexture)
          }))
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

function category(id: Group, label: string, group: BrushCategory['group'], feature?: Feature): BrushCategory {
  const fields = Object.entries(settingGroups[id]).filter(([key, field]) => supported(id, key, field));
  return {
    id,
    label,
    group,
    applies: (b) =>
      id === 'bristle' ? values(b).tipKind === 'dBrush' : id === 'erodible' ? values(b).tipKind === 'dTips' : true,
    status: (b) => (feature && !values(b)[feature] ? 'Off' : status(id, b)),
    about:
      id === 'bristle' || id === 'erodible'
        ? 'Paint uses a generated 2D tip approximation, without physical wear simulation.'
        : undefined,
    settings: [
      ...(feature ? [row(id, feature, featureFields[feature], undefined, true)] : []),
      ...fields.map(([key, field]) => row(id, key, field, feature))
    ]
  };
}

function row(group: Group, key: string, field: SettingField, feature?: Feature, root = false): BrushSetting {
  const read = (b: Brush): unknown =>
    root ? values(b)[key as Feature] : (values(b)[group] as Record<string, unknown>)[key];
  const write = (b: Brush, value: unknown): Partial<Brush> => {
    const current = values(b);
    const next = root ? { ...current, [key]: value } : { ...current, [group]: { ...current[group], [key]: value } };
    return { engine: { ...b.engine!, settings: { ...settings(b), values: next } } };
  };
  const base = {
    id: `abr-${group}-${key}`,
    label: field.label,
    applies: (b: Brush) => root || applicable(group, key, b),
    enabled: (b: Brush) => (!feature || values(b)[feature]) && (group !== 'texture' || !!settings(b).patternId)
  };
  if (field.kind === 'boolean') {
    return { ...base, kind: 'toggle', read: (b) => Boolean(read(b)), write };
  }

  if (field.options) {
    return {
      ...base,
      kind: 'choice',
      options: field.options.map((o) => ({ ...o, value: String(o.value) })),
      read: (b) => String(read(b)),
      write: (b, value) => {
        const option = field.options!.find((o) => String(o.value) === value);
        if (!option) {
          throw new RangeError(`Unknown ${key}: ${value}`);
        }
        return write(b, option.value);
      }
    };
  }

  return {
    ...base,
    kind: 'number',
    unit: field.unit === '#Prc' ? '%' : field.unit === '#Ang' ? '°' : '',
    min: () => field.min ?? 0,
    max: () => field.max ?? 100,
    step: 1,
    read: (b) => Number(read(b)),
    write: (b, value) =>
      write(
        b,
        Math.max(field.min ?? 0, Math.min(field.max ?? 100, Math.round(Number.isNaN(value) ? Number(read(b)) : value)))
      )
  };
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

/** Fields absent from renderer/sampler reads, and resource selectors without a resource picker. */
function supported(group: Group, key: string, field: SettingField) {
  return (
    field.kind !== 'text' &&
    field.kind !== 'color' &&
    !field.label.includes('stored only') &&
    !(group === 'tool' && ['type', 'loadSolidColorOnly'].includes(key)) &&
    !(group === 'erodible' && key === 'physics')
  );
}

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

function status(group: Group, b: Brush): string {
  const v = values(b);
  switch (group) {
    case 'tool':
      return `${Math.round(b.opacity * 100)}% opacity · ${Math.round(b.flow * 100)}% flow`;
    case 'scattering':
      return `Spread ${v.scattering.scatter}% · ×${v.scattering.count}`;
    case 'texture':
      return settings(b).patternId ? `Depth ${v.texture.depth}% · ${v.texture.scale}% scale` : 'No embedded pattern';
    case 'dualBrush':
      return `${v.dualBrush.diameter} px · ×${v.dualBrush.count}`;
    case 'colorDynamics':
      return `Hue ${v.colorDynamics.hueJitter}% · Saturation ${v.colorDynamics.saturationJitter}%`;
    case 'shapeDynamics':
      return dynamics(v.shapeDynamics, 'Size');
    case 'transfer':
      return dynamics(v.transfer, 'Flow');
    case 'brushPose':
      return v.brushPose.overridePressure ? `Pressure ${v.brushPose.pressure}%` : 'Tablet pose';
    case 'smoothing':
      return `${v.smoothing.amount}% · ${v.smoothing.pulledString ? 'Pulled string' : 'Catch-up'}`;
    case 'bristle':
      return `${v.bristle.density}% bristles`;
    case 'erodible':
      return v.tipVariant === 0 ? `${v.erodible.softness}% softness` : `${v.erodible.splatCount} spatters`;
  }
}

function dynamics(fields: object, label: string) {
  const entries = Object.entries(fields);
  const controls = [
    ...new Set(
      entries
        .filter(([key, value]) => key.endsWith('Control') && value !== 0)
        .map(([, value]) =>
          settingGroups.shapeDynamics.angleControl.options?.find((o) => o.value === value)?.label.replace('Pen ', '')
        )
    )
  ];
  return controls.length
    ? controls.join(' + ')
    : `${label} jitter ${entries.find(([key]) => key === `${label.toLowerCase()}Jitter`)?.[1] ?? 0}%`;
}

function always() {
  return true;
}

/** ABR settings are validated at the engine boundary; callers restrict this adapter to that engine. */
function settings(brush: Brush): AbrBrushSettings {
  return brush.engine!.settings as AbrBrushSettings;
}
