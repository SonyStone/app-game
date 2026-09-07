import type { Brush as BrushWithPreview } from '@app-game/abr-parser/reader';
import { z } from 'zod/v3';
import { featureFields, fieldsSchema, settingGroups, type SettingField } from './settings-fields';

/** Editable preset values; original descriptors remain the source of unknown and unchanged data. */
export const brushFormSchema = z.object({
  tipKind: z.enum(['computedBrush', 'sampledBrush', 'dBrush', 'dTips']),
  tipVariant: z.number(),
  bristle: fieldsSchema(settingGroups.bristle),
  erodible: fieldsSchema(settingGroups.erodible),
  name: z.string().min(1, 'Name is required'),
  diameter: z.number().finite().min(1).max(5000),
  spacing: z.number().finite().min(1).max(1000),
  spacingEnabled: z.boolean(),
  angle: z.number().finite().min(-180).max(180),
  roundness: z.number().finite().min(0).max(100),
  hardness: z.number().finite().min(0).max(100),
  flipX: z.boolean(),
  flipY: z.boolean(),
  ...fieldsSchema(featureFields).shape,
  shapeDynamics: fieldsSchema(settingGroups.shapeDynamics),
  scattering: fieldsSchema(settingGroups.scattering),
  texture: fieldsSchema(settingGroups.texture),
  dualBrush: fieldsSchema(settingGroups.dualBrush),
  colorDynamics: fieldsSchema(settingGroups.colorDynamics),
  transfer: fieldsSchema(settingGroups.transfer),
  brushPose: fieldsSchema(settingGroups.brushPose),
  smoothing: fieldsSchema(settingGroups.smoothing)
});

/** Validated settings snapshot, also sent to the preview worker. */
export type BrushFormValues = z.infer<typeof brushFormSchema>;

/** Reads Photoshop descriptor fields without treating valid zero values as missing. */
export function brushToFormValues(brush: BrushWithPreview): BrushFormValues {
  const s = brush.settings ?? {};
  const brsh = record(s.Brsh);
  return {
    tipKind: ['dBrush', 'dTips', 'sampledBrush'].includes(String(brsh.__classId))
      ? (brsh.__classId as BrushFormValues['tipKind'])
      : 'computedBrush',
    tipVariant: Number(brsh.dtipsType ?? 0),
    bristle: readFields(settingGroups.bristle, s),
    erodible: readFields(settingGroups.erodible, s),
    name: brush.name,
    diameter: brush.diameter ?? 30,
    spacing: brush.spacing ?? 25,
    spacingEnabled: brsh.Intr !== false,
    angle: brush.angle ?? 0,
    roundness: brush.roundness ?? 100,
    hardness: brush.hardness ?? 100,
    flipX: brsh.flipX === true,
    flipY: brsh.flipY === true,
    ...readFields(featureFields, s),
    shapeDynamics: readFields(settingGroups.shapeDynamics, s),
    scattering: readFields(settingGroups.scattering, s),
    texture: readFields(settingGroups.texture, s),
    dualBrush: readFields(settingGroups.dualBrush, s),
    colorDynamics: readFields(settingGroups.colorDynamics, s),
    transfer: readFields(settingGroups.transfer, s),
    brushPose: readFields(settingGroups.brushPose, s),
    smoothing: readFields(settingGroups.smoothing, s)
  };
}

/** Writes only edited fields, preserving disabled settings, unknown values and typed descriptor templates. */
export function formValuesToBrush(brush: BrushWithPreview, values: BrushFormValues): BrushWithPreview {
  const before = brushToFormValues(brush);
  if (JSON.stringify(before) === JSON.stringify(values)) return brush;
  let settings = { ...brush.settings };
  const write = (path: string, value: unknown) => {
    settings = writePath(settings, path.split('.'), value);
  };
  const core = {
    diameter: ['Dmtr', '#Pxl'],
    spacing: ['Spcn', '#Prc'],
    angle: ['Angl', '#Ang'],
    roundness: ['Rndn', '#Prc'],
    hardness: ['Hrdn', '#Prc']
  } as const;
  for (const key of Object.keys(core) as (keyof typeof core)[]) {
    if (values[key] !== before[key] && (key !== 'hardness' || brush.type === 'computed')) {
      const [field, unit] = core[key];
      write(`Brsh.${field}`, { unit, value: values[key] });
    }
  }
  if (values.name !== before.name) write('Nm  ', values.name);
  if (values.flipX !== before.flipX) write('Brsh.flipX', values.flipX);
  if (values.flipY !== before.flipY) write('Brsh.flipY', values.flipY);
  if (values.spacingEnabled !== before.spacingEnabled) write('Brsh.Intr', values.spacingEnabled);
  writeFields(featureFields, before, values, write);
  for (const key of Object.keys(settingGroups) as (keyof typeof settingGroups)[]) {
    writeFields(settingGroups[key], before[key], values[key], write);
  }
  // Newly enabled features need complete native objects even if their defaults weren't touched.
  const enabledGroups = {
    useShapeDynamics: 'shapeDynamics',
    useScattering: 'scattering',
    useTexture: 'texture',
    useDualBrush: 'dualBrush',
    useColorDynamics: 'colorDynamics',
    useTransfer: 'transfer',
    useBrushPose: 'brushPose'
  } as const;
  for (const [toggle, group] of Object.entries(enabledGroups) as [
    keyof typeof enabledGroups,
    (typeof enabledGroups)[keyof typeof enabledGroups]
  ][]) {
    if (values[toggle] && !before[toggle]) writeFields(settingGroups[group], {}, values[group], write);
  }
  if (values.useDualBrush && !record(record(settings.dualBrush).Brsh).__classId) {
    write('dualBrush.Brsh', {
      __classId: 'computedBrush',
      Dmtr: { unit: '#Pxl', value: values.dualBrush.diameter },
      Spcn: { unit: '#Prc', value: values.dualBrush.spacing },
      Angl: { unit: '#Ang', value: 0 },
      Rndn: { unit: '#Prc', value: 100 },
      Hrdn: { unit: '#Prc', value: 100 },
      Intr: true,
      flipX: false,
      flipY: false
    });
  }
  if (
    values.useDualBrush &&
    (!before.useDualBrush ||
      values.dualBrush.scatter !== before.dualBrush.scatter ||
      values.dualBrush.count !== before.dualBrush.count ||
      values.dualBrush.bothAxes !== before.dualBrush.bothAxes)
  )
    write('dualBrush.useScatter', true);
  return {
    ...brush,
    name: values.name,
    diameter: values.diameter,
    spacing: values.spacing,
    angle: values.angle,
    roundness: values.roundness,
    hardness: brush.type === 'computed' ? values.hardness : brush.hardness,
    settings
  };
}

/** Reads a descriptor object safely; scalar values and binary data are not objects here. */
export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Uint8Array)
    ? (value as Record<string, unknown>)
    : {};
}

function readFields<T extends Record<string, SettingField>>(
  fields: T,
  settings: Record<string, unknown>
): z.infer<ReturnType<typeof fieldsSchema<T>>> {
  return Object.fromEntries(
    Object.entries(fields).map(([key, field]) => {
      let value: unknown = settings;
      for (const part of field.path.split('.')) value = record(value)[part];
      if (field.unit || field.kind === 'choice') value = record(value).value;
      if (field.factor && typeof value === 'number') value *= field.factor;
      return [key, typeof value === typeof field.initial ? value : field.initial];
    })
  ) as z.infer<ReturnType<typeof fieldsSchema<T>>>;
}

function writeFields(
  fields: Record<string, SettingField>,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  write: (path: string, value: unknown) => void
) {
  for (const [key, field] of Object.entries(fields)) {
    let value = after[key];
    if (value === before[key]) continue;
    // Empty references must not become invalid sample/pattern identifiers.
    if (field.kind === 'text' && value === '') continue;
    if (field.factor && typeof value === 'number') value /= field.factor;
    write(
      field.path,
      field.unit ? { unit: field.unit, value } : field.kind === 'choice' ? { type: 'BlnM', value } : value
    );
  }
}

/** Copies only the edited descriptor branch and supplies required class IDs on new objects. */
function writePath(source: Record<string, unknown>, [key, ...rest]: string[], value: unknown): Record<string, unknown> {
  if (!rest.length) return { ...source, [key!]: value };
  const existing = record(source[key!]);
  const classId =
    key === 'dualBrush'
      ? 'dualBrush'
      : key === 'Txtr'
        ? 'Ptrn'
        : key === 'toolOptions'
          ? 'PbTl'
          : key === 'Brsh'
            ? 'computedBrush'
            : 'brVr';
  const defaults =
    classId === 'computedBrush'
      ? {
          Dmtr: { unit: '#Pxl', value: 30 },
          Spcn: { unit: '#Prc', value: 25 },
          Hrdn: { unit: '#Prc', value: 100 },
          Angl: { unit: '#Ang', value: 0 },
          Rndn: { unit: '#Prc', value: 100 },
          Intr: true,
          flipX: false,
          flipY: false
        }
      : classId === 'brVr'
        ? { bVTy: 0, fStp: 25, jitter: { unit: '#Prc', value: 0 }, 'Mnm ': { unit: '#Prc', value: 0 } }
        : {};
  return { ...source, [key!]: writePath({ __classId: classId, ...defaults, ...existing }, rest, value) };
}

/** Tool options saved with a preset. Absence keeps the host's current paint/color controls. */
export function brushToolSettings(brush: BrushWithPreview) {
  const tool = record(brush.settings.toolOptions);
  const percentage = (value: unknown) => {
    const number = typeof value === 'number' ? value : record(value).value;
    return typeof number === 'number' && Number.isFinite(number) ? Math.max(0, Math.min(1, number / 100)) : undefined;
  };
  return {
    pressureOverridesSize: tool.usePressureOverridesSize === true,
    pressureOverridesOpacity: tool.usePressureOverridesOpacity === true,
    flow: percentage(tool.flow),
    opacity: percentage(tool.Opct),
    blendMode: typeof record(tool['Md  ']).value === 'string' ? String(record(tool['Md  ']).value) : 'Nrml'
  };
}
