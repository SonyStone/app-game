import type { CmykConverter } from '@app-game/chroma/io/cmyk/cmykProfile';
import { hsv2rgb } from '@app-game/chroma/io/hsv/hsv2rgb';
import { labD50ToRgb } from '@app-game/chroma/io/lab/labD50ToRgb';
import { z } from 'zod/v3';
import type { BrushAsset as BrushWithPreview } from './library';
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
  smoothing: fieldsSchema(settingGroups.smoothing),
  tool: fieldsSchema(settingGroups.tool)
});

/** Validated settings snapshot, also sent to the preview worker. */
export type BrushFormValues = z.infer<typeof brushFormSchema>;

/** Reads Photoshop descriptor fields without treating valid zero values as missing.
 * Pass the selected CMYK converter for profile-dependent saved colors.
 */
export function brushToFormValues<T extends Pick<BrushWithPreview, 'preset' | 'name'>>(
  brush: T,
  cmyk?: CmykConverter
): BrushFormValues {
  const s = record(brush.preset);
  const brsh = record(s.tip);
  return {
    tipKind: ['dBrush', 'dTips', 'sampledBrush'].includes(String(tipKinds[String(brsh.kind)] ?? brsh.kind))
      ? (tipKinds[String(brsh.kind)] as BrushFormValues['tipKind'])
      : 'computedBrush',
    tipVariant: Number(brsh.dtipsType ?? 0),
    bristle: readFields(settingGroups.bristle, s),
    erodible: readFields(settingGroups.erodible, s),
    name: brush.name,
    diameter: brush.preset.tip?.diameter ?? 30,
    spacing: brush.preset.tip?.spacing ?? 25,
    spacingEnabled: brsh.spacingEnabled !== false,
    angle: brush.preset.tip?.angle ?? 0,
    roundness: brush.preset.tip?.roundness ?? 100,
    hardness: brush.preset.tip?.hardness ?? 100,
    flipX: brsh.flipX === true,
    flipY: brsh.flipY === true,
    ...readFields(featureFields, s),
    useBuildUp:
      typeof s.buildUpEnabled === 'boolean' ? s.buildUpEnabled : record(s.toolOptions).buildUpEnabled === true,
    shapeDynamics: readFields(settingGroups.shapeDynamics, s),
    scattering: readFields(settingGroups.scattering, s),
    texture: readFields(settingGroups.texture, s),
    dualBrush: readFields(settingGroups.dualBrush, s),
    colorDynamics: readFields(settingGroups.colorDynamics, s),
    transfer: readFields(settingGroups.transfer, s),
    brushPose: readFields(settingGroups.brushPose, s),
    smoothing: readFields(settingGroups.smoothing, s),
    tool: readFields(settingGroups.tool, s, cmyk)
  };
}

/** Writes only edited fields, preserving disabled settings, unknown values and typed descriptor templates.
 * Use the same CMYK converter as brushToFormValues so unrelated edits preserve the source color.
 */
export function formValuesToBrush(
  brush: BrushWithPreview,
  values: BrushFormValues,
  cmyk?: CmykConverter
): BrushWithPreview {
  const before = brushToFormValues(brush, cmyk);
  if (JSON.stringify(before) === JSON.stringify(values)) return brush;
  let settings: Record<string, unknown> = { ...brush.preset };
  const write = (path: string, value: unknown) => {
    settings = writePath(settings, path.split('.'), value);
    // Tool presets also carry copies of brush dynamics. Photoshop must not restore
    // stale copies after the user edits the corresponding Brush Settings control.
    const root = path.split('.')[0]!;
    if (
      settings.toolOptions &&
      [
        'flowDynamics',
        'opacityDynamics',
        'sizeDynamics',
        'colorDynamics',
        'wetnessDynamics',
        'mixDynamics',
        'buildUpEnabled'
      ].includes(root)
    )
      settings = writePath(settings, ['toolOptions', ...path.split('.')], value);
  };
  for (const key of ['diameter', 'spacing', 'angle', 'roundness', 'hardness'] as const) {
    if (values[key] !== before[key] && (key !== 'hardness' || brush.preset.tip?.kind === 'computed'))
      write(`tip.${key}`, values[key]);
  }
  if (values.name !== before.name) write('name', values.name);
  if (values.flipX !== before.flipX) write('tip.flipX', values.flipX);
  if (values.flipY !== before.flipY) write('tip.flipY', values.flipY);
  if (values.spacingEnabled !== before.spacingEnabled) write('tip.spacingEnabled', values.spacingEnabled);
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
  if (values.useDualBrush && !record(record(settings.dualBrush).tip).kind) {
    write('dualBrush.tip', {
      kind: 'computed',
      diameter: values.dualBrush.diameter,
      spacing: values.dualBrush.spacing,
      angle: 0,
      roundness: 100,
      hardness: 100,
      spacingEnabled: true,
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
    write('dualBrush.scatteringEnabled', true);
  return { ...brush, name: values.name, preset: { ...brush.preset, ...settings } };
}

/** Reads a descriptor object safely; scalar values and binary data are not objects here. */
export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Uint8Array)
    ? (value as Record<string, unknown>)
    : {};
}

function readFields<T extends Record<string, SettingField>>(
  fields: T,
  settings: Record<string, unknown>,
  cmyk?: CmykConverter
): z.infer<ReturnType<typeof fieldsSchema<T>>> {
  return Object.fromEntries(
    Object.entries(fields).map(([key, field]) => {
      let value: unknown = settings;
      for (const part of field.path.split('.')) value = record(value)[part];
      if (field.kind === 'choice' && !field.plain) value = record(value).value;
      if (field.kind === 'color') value = descriptorRgbColor(value, cmyk);
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
    if (field.kind === 'color') {
      const hex = String(value);
      write(
        field.path,
        hex
          ? {
              kind: 'RGBC',
              red: parseInt(hex.slice(1, 3), 16),
              green: parseInt(hex.slice(3, 5), 16),
              blue: parseInt(hex.slice(5, 7), 16)
            }
          : undefined
      );
      continue;
    }
    if (field.factor && typeof value === 'number') value /= field.factor;
    write(field.path, field.kind === 'choice' && !field.plain ? { domain: 'BlnM', value } : value);
  }
}

/** Copies only the edited descriptor branch and supplies required class IDs on new objects. */
function writePath(source: Record<string, unknown>, [key, ...rest]: string[], value: unknown): Record<string, unknown> {
  if (!rest.length) {
    const next = { ...source };
    if (value === undefined) delete next[key!];
    else if (record(value).kind === 'RGBC' && record(source[key!]).kind === 'RGBC')
      next[key!] = { ...record(source[key!]), ...record(value) };
    else if (record(value).kind === 'RGBC' && record(source[key!]).extensions !== undefined)
      next[key!] = { ...record(value), extensions: record(source[key!]).extensions };
    else next[key!] = value;
    return next;
  }
  const existing = record(source[key!]);
  const kind =
    key === 'dualBrush'
      ? 'dualBrush'
      : key === 'texture'
        ? 'pattern'
        : key === 'toolOptions'
          ? 'PbTl'
          : key === 'tip'
            ? 'computed'
            : 'dynamics';
  const defaults =
    kind === 'computed'
      ? {
          diameter: 30,
          spacing: 25,
          hardness: 100,
          angle: 0,
          roundness: 100,
          spacingEnabled: true,
          flipX: false,
          flipY: false
        }
      : kind === 'dynamics'
        ? { control: 0, fadeSteps: 25, jitter: 0, minimum: 0 }
        : {};
  return { ...source, [key!]: writePath({ kind, ...defaults, ...existing }, rest, value) };
}

/** Tool options saved with a preset. Absence keeps the host's current paint/color controls. */
export function brushToolSettings(brush: BrushWithPreview, cmyk?: CmykConverter) {
  const tool = record(brush.preset.toolOptions);
  const percentage = (value: unknown) => {
    const number = typeof value === 'number' ? value : record(value).value;
    return typeof number === 'number' && Number.isFinite(number) ? Math.max(0, Math.min(1, number / 100)) : undefined;
  };
  return {
    foreground: descriptorRgbColor(tool.foregroundColor, cmyk),
    background: descriptorRgbColor(tool.backgroundColor, cmyk),
    pressureOverridesSize: tool.usePressureOverridesSize === true,
    pressureOverridesOpacity: tool.usePressureOverridesOpacity === true,
    flow: percentage(tool.flow),
    opacity: percentage(tool.opacity),
    blendMode: typeof record(tool['mode']).value === 'string' ? String(record(tool['mode']).value) : 'Nrml'
  };
}

/** Converts RGB/HSB/Lab D50/Gray descriptors to encoded sRGB for the editor and renderer.
 * Preset data is untouched until the user edits the color. Lab clips to sRGB; native out-of-gamut mapping may differ.
 * Gray follows native sRGB paint coverage (0 = white, 100 = black), not SolidColor.rgb readback.
 * CMYK requires an explicit source profile; malformed colors return undefined.
 */
export function descriptorRgbColor(value: unknown, cmyk?: CmykConverter): string | undefined {
  const color = record(value);
  if (color.kind === 'CMYC') {
    const channels = ['cyan', 'magenta', 'yellow', 'black'].map((key) => colorChannel(color[key], '#Prc'));
    if (!cmyk || !channels.every((channel): channel is number => inRange(channel, 100))) return undefined;
    const converted = cmyk([channels[0]!, channels[1]!, channels[2]!, channels[3]!]);
    return converted.every((channel) => inRange(channel, 255)) ? rgbHex(converted) : undefined;
  }
  if (color.kind === 'RGBC') {
    const channels = [color['red'], color['green'], color['blue']];
    if (!channels.every((channel): channel is number => inRange(channel, 255))) return undefined;
    return rgbHex(channels);
  }
  if (color.kind === 'HSBC') {
    const hue = colorChannel(color['hue'], '#Ang');
    const saturation = colorChannel(color.saturation, '#Prc');
    const brightness = colorChannel(color.brightness, '#Prc');
    if (!inRange(hue, 360) || !inRange(saturation, 100) || !inRange(brightness, 100)) return undefined;
    return rgbHex(hsv2rgb(hue, saturation / 100, brightness / 100).slice(0, 3));
  }
  if (color.kind === 'Grsc') {
    const gray = colorChannel(color['gray'], '#Prc');
    if (!inRange(gray, 100)) return undefined;
    // Subtract before scaling: 90% must round 25.5 to 26, not 25.499999999999993 to 25.
    const channel = ((100 - gray) * 255) / 100;
    return rgbHex([channel, channel, channel]);
  }
  if (color.kind === 'LbCl') {
    const channels = labChannels(color);
    return channels ? rgbHex(channels.map((channel) => Math.max(0, Math.min(255, channel)))) : undefined;
  }
  return undefined;
}

/** Creates a host snapshot with resolved CMYK colors. The editor's original descriptor stays unchanged.
 * Resolve synchronously before an async host action so a replaced/disposed ICC transform cannot affect it.
 * Throws when a saved CMYK color is malformed or its source profile has not been selected.
 */
export function brushWithResolvedColors(brush: BrushWithPreview, cmyk?: CmykConverter): BrushWithPreview {
  const tool = record(brush.preset.toolOptions);
  let resolved = tool;
  for (const key of ['foregroundColor', 'backgroundColor'] as const) {
    if (record(tool[key]).kind !== 'CMYC') continue;
    const color = descriptorRgbColor(tool[key], cmyk);
    if (!color)
      throw new Error(
        cmyk
          ? 'The saved CMYK color is malformed. Edit it in Tool Options before applying this preset.'
          : 'Select a CMYK ICC profile in Tool Options before applying this preset.'
      );
    resolved = {
      ...resolved,
      [key]: {
        kind: 'RGBC',
        red: parseInt(color.slice(1, 3), 16),
        green: parseInt(color.slice(3, 5), 16),
        blue: parseInt(color.slice(5, 7), 16)
      }
    };
  }
  return resolved === tool
    ? brush
    : {
        ...brush,
        preset: {
          ...brush.preset,
          toolOptions: { ...brush.preset.toolOptions, kind: String(resolved.kind), ...resolved }
        }
      };
}

/** Reports a valid Lab color that loses gamut when displayed in the application's sRGB canvas. */
export function descriptorColorClipped(value: unknown): boolean {
  return labChannels(record(value))?.some((channel) => channel < -0.001 || channel > 255.001) ?? false;
}

function labChannels(color: Record<string, unknown>) {
  const lightness = color.lightness,
    a = color['a'],
    b = color['b'];
  if (color.kind !== 'LbCl' || !inRange(lightness, 100) || !inRange(a, 127, -128) || !inRange(b, 127, -128))
    return undefined;
  return labD50ToRgb(lightness, a, b);
}

function inRange(value: unknown, maximum: number, minimum = 0): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum;
}
/** Units are checked before conversion, so pixels cannot silently become an angle or percentage. */
function colorChannel(value: unknown, unit: '#Ang' | '#Prc'): unknown {
  return typeof value === 'number' ? value : record(value).unit === unit ? record(value).value : undefined;
}
function rgbHex(channels: readonly number[]): string {
  return `#${channels.map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`;
}

const tipKinds: Record<string, BrushFormValues['tipKind']> = {
  computed: 'computedBrush',
  sampled: 'sampledBrush',
  bristle: 'dBrush',
  naturalMedia: 'dTips'
};
