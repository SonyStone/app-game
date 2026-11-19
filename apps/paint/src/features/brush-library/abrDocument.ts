import { isBlockEraser } from '@app-game/abr-brush/blockEraser';
import {
  brushToFormValues,
  descriptorRgbColor,
  formValuesToBrush,
  record,
  type BrushFormValues
} from '@app-game/abr-brush/form';
import type { BrushAsset, BrushTipImage } from '@app-game/abr-brush/library';
import { brushPreviewResources, decodePreviewResources } from '@app-game/abr-brush/resources';
import { featureFields, settingGroups } from '@app-game/abr-brush/settings-fields';
import { prepareAbrBrush } from '@app-game/abr-paint/preset';
import type { BrushResource } from '@app-game/abr-paint/resources';
import { initAbr } from '@app-game/abr-parser';
import type { Brush } from '@app-game/paint-core/brush';
import { assetId, type Coverage } from '@app-game/paint-core/paintbrush/asset';
import {
  brushSchema,
  versionOneDefaults as defaults,
  parseDocument,
  patch,
  type BrushDocument
} from '@app-game/paint-core/paintbrush/document';

import { hostExtension } from './abrHost';
import { isPaintPressureBinding } from './nativeDocument';

type Definition = BrushDocument['definition'];

/**
 * Imports the editable descriptor fields, including those behind an unchecked switch.
 * Section lengths are pixels, angles are degrees, and percentages are fractions (spacing can exceed one).
 * Extension values use the original parsed Photoshop units and descriptor paths.
 * Stores sampled coverage by digest. Computed and physical tips regenerate from their parameters.
 * Paint mixing and stroke correction are independent host settings. ABR imports inherit both
 * unless supplied by the host. Photoshop smoothing always stays in photoshop.smoothing.v1.
 */
export async function abrDocument(asset: BrushAsset, host: Partial<Pick<Brush, 'mixing' | 'stroke'>> = {}) {
  await initAbr();
  const tip = asset.preset.tip;
  const kind = tip?.kind ?? 'computed';
  const toolCode = asset.preset.toolOptions?.kind ?? 'PbTl';
  const definition: Definition = {
    ...(host.mixing ? { mixing: host.mixing } : {}),
    tool: toolNames.get(toolCode) ?? 'photoshop.' + toolCode,
    tips: { primary: { kind: kind === 'computed' ? 'ellipse' : kind } },
    sequence: { order: 'cycle', tips: ['primary'] },
    size: tip?.diameter ?? 30,
    extensions: {}
  };
  if (host.stroke) {
    const { mode, ...levels } = host.stroke;
    definition.stroke = { smoothing: mode, ...levels };
  }
  const primary = definition.tips.primary!;
  const mappings: NonNullable<BrushDocument['origin']>['mappings'] = [];
  function mapped(field: string, value: unknown, target: string) {
    mappings.push({ field, value: structuredClone(value ?? null), target, outcome: 'exact' });
  }
  mapped('toolOptions.kind', toolCode, '/tool');
  mapped('tip.kind', kind, '/tips/primary/kind');
  mapped('tip.diameter', definition.size, '/size');
  function extension(group: string) {
    const id = extensionId(group);
    return (definition.extensions![id] ??= { impact: 'appearance', value: {} });
  }
  function store(group: string, field: string, value: unknown) {
    record(extension(group).value)[field] = structuredClone(value);
    mapped(field, value, '/extensions/' + extensionId(group) + '/value/' + field);
  }
  // Fractional sections use fractions of diameter or full coverage. Preserve the low-order
  // residual when binary division by 100 would otherwise change the recovered percentage.
  function percent(field: string, value: number, target: string, group: string) {
    const fraction = value / 100;
    const residual = value - fraction * 100;
    if (residual) {
      record(extension(group).value)[field + '.roundoff'] = residual;
    }
    mapped(field, value, target);
    return fraction;
  }
  definition.placement = {
    law: 'photoshop-v1',
    spacing: percent('tip.spacing', tip?.spacing ?? 25, '/placement/spacing', 'tip')
  };
  primary.angleDeg = tip?.angle ?? 0;
  mapped('tip.angle', primary.angleDeg, '/tips/primary/angleDeg');
  for (const key of ['roundness', 'hardness'] as const) {
    primary[key] = percent('tip.' + key, tip?.[key] ?? 100, '/tips/primary/' + key, 'tip');
  }
  // Look up both auxiliary selections even when their effects are currently disabled.
  const sources = brushPreviewResources({
    ...asset,
    preset: {
      ...asset.preset,
      textureEnabled: true,
      dualBrush: { ...asset.preset.dualBrush, kind: 'dualBrush', enabled: true }
    }
  });
  const { pattern, dualTip } = decodePreviewResources({ pattern: sources.pattern, dualSample: sources.dualSample });
  // A dormant effect can reference data the parser cannot decode. Preserve its controls;
  // resolving the enabled effect must then report the missing coverage.
  if (pattern) {
    definition.texture = { resource: 'pattern', enabled: asset.preset.textureEnabled === true };
  }
  if (asset.preset.dualBrush) {
    const secondary = asset.preset.dualBrush.tip;
    definition.dual = { tip: 'secondary', enabled: asset.preset.dualBrush.enabled === true };
    definition.tips.secondary = dualTip
      ? { kind: 'sampled', resource: 'secondary' }
      : { kind: 'ellipse', hardness: (secondary?.hardness ?? 100) / 100 };
  }
  for (const [path, group] of fields) {
    const value = path.split('.').reduce<unknown>((object, key) => record(object)[key], asset.preset);
    if (value === undefined || path === 'toolOptions.kind') {
      continue;
    }
    if (definition.texture && path === 'textureBlendMode' && record(value).value === 'Hght') {
      definition.texture.blend = 'photoshop-height-v1';
      mapped(path, value, '/texture/blend');
      continue;
    }
    if (definition.dual && path === 'dualBrush.blendMode' && record(value).value === 'Mltp') {
      definition.dual.blend = 'multiply';
      mapped(path, value, '/dual/blend');
      continue;
    }
    const destination = auxiliaryFields.get(path);
    if (destination && (destination.section === 'texture' ? definition.texture : definition.dual)) {
      const section =
        destination.section === 'tips/secondary' ? definition.tips.secondary! : definition[destination.section]!;
      const target = '/' + destination.section + '/' + destination.key;
      if (destination.fraction && typeof value === 'number') {
        section[destination.key] = percent(path, value, target, group);
      } else {
        section[destination.key] = value;
        mapped(path, value, target);
      }
      continue;
    }
    if ((path === 'toolOptions.flow' || path === 'toolOptions.opacity') && typeof value === 'number') {
      const key = path === 'toolOptions.flow' ? 'flow' : 'opacity';
      (definition.transfer ??= {})[key] = percent(path, value, '/transfer/' + key, 'tool');
    } else if (
      (path === 'toolOptions.foregroundColor' || path === 'toolOptions.backgroundColor') &&
      record(value).kind === 'RGBC' &&
      ['red', 'green', 'blue'].every((k) => Number.isInteger(record(value)[k])) &&
      descriptorRgbColor(value)
    ) {
      const key = path === 'toolOptions.foregroundColor' ? 'foreground' : 'background';
      (definition.color ??= {})[key] = descriptorRgbColor(value);
      mapped(path, value, '/color/' + key);
    } else {
      store(group, path, value);
    }
  }

  const assets = new Map<string, Coverage>();
  const resources: NonNullable<BrushDocument['resources']> = {};
  async function save(alias: string, image: BrushTipImage) {
    const coverage = { width: image.width, height: image.height, pixels: new Uint8Array(image.data) };
    const sha256 = await assetId(coverage);
    assets.set(sha256, coverage);
    resources[alias] = { format: 'r8', width: image.width, height: image.height, sha256 };
  }
  if (kind === 'sampled') {
    if (asset.tipImage) {
      await save('primary', asset.tipImage);
      primary.resource = 'primary';
      mapped('tip.sampleId', tip?.sampleId ?? 'primary', '/tips/primary/resource');
    } else {
      // A block eraser can legitimately prepare with an absent dormant sample.
      primary.kind = 'photoshop.unresolved-sample';
      if (tip?.sampleId) {
        store('tip', 'tip.sampleId', tip.sampleId);
      }
    }
  }
  for (const [group, alias, source] of [
    ['texture', 'pattern', pattern],
    ['dual-brush', 'secondary', dualTip]
  ] as const) {
    if (source) {
      await save(alias, source);
      if (definition.extensions![extensionId(group)]) {
        extension(group).resources = [alias];
      }
    }
  }
  const document = brushSchema.parse({
    id: asset.id,
    name: asset.name,
    definition,
    resources,
    origin: { format: 'photoshop.abr', presetKey: asset.preset.sourceId, importer: 'paint-abr/1', mappings }
  });
  return { document, assets };
}

/**
 * Produces today's ABR engine input from archive coverage and editable settings. The placement,
 * transfer and tip sections override older extension fields. Unrecognized extensions stay on the
 * document. Brush and eraser can be approximated by Paint's native adapter. Pencil, mixer,
 * smudge, blur and sharpen require the Photoshop tool implementation. Other Photoshop class
 * codes retain their identity in tool as photoshop.<code>. Unavailable coverage or an
 * unrecognized appearance extension prevents resolution.
 */
export async function resolveAbr(document: BrushDocument, assets: ReadonlyMap<string, Coverage>) {
  const d = document.definition;
  const paintPlacement = (d.placement?.law ?? defaults.placement.law) === 'paint-distance-v1';
  if (d.sequence.tips.length !== 1 || (!paintPlacement && d.placement?.law !== 'photoshop-v1')) {
    throw new Error('Expected one primary tip with Paint or Photoshop placement');
  }
  if (
    d.dynamics?.some((binding) => !paintPlacement || !isPaintPressureBinding(binding)) ||
    new Set(d.dynamics?.map((binding) => binding.target)).size !== (d.dynamics?.length ?? 0) ||
    d.stroke?.taper
  ) {
    throw new Error('The ABR sampler cannot apply document bindings or taper');
  }
  for (const [id, ext] of Object.entries(d.extensions ?? {})) {
    if (
      ext.impact !== 'metadata' &&
      id !== hostExtension &&
      !(paintPlacement && id === 'paint.native-settings.v1') &&
      !photoshopExtensions.includes(id)
    ) {
      throw new Error('Unsupported ABR extension: ' + id);
    }
  }
  const primary = d.tips[d.sequence.tips[0]!]!;
  const source = descriptorFrom(d, primary);
  async function resource(alias: string): Promise<BrushResource> {
    const ref = document.resources?.[alias];
    const image = ref && assets.get(ref.sha256);
    if (
      !ref ||
      ref.format !== 'r8' ||
      !image ||
      ref.width !== image.width ||
      ref.height !== image.height ||
      (await assetId(image)) !== ref.sha256
    ) {
      throw new Error('Missing or invalid ABR coverage: ' + alias);
    }
    return { ...image, format: 'r8unorm', id: ref.sha256 };
  }

  await initAbr();
  const sampled = primary.resource ? await resource(primary.resource) : undefined;
  // prepareAbrBrush normally resolves enabled auxiliary images from compressed ABR records.
  // Supply archive images below, while reusing its tool overrides, validation and tip generation.
  const preset = { ...source, kind: 'brush', sourceId: document.id };
  const dualBrush = record(source.dualBrush);
  const prepared = prepareAbrBrush({
    id: document.id,
    name: document.name,
    preset: { ...preset, textureEnabled: false, dualBrush: { ...dualBrush, kind: 'dualBrush', enabled: false } },
    tipImage: sampled && { ...sampled, data: sampled.pixels, depth: 8, sourceDepth: 8 },
    resources: [],
    source: { format: 'photoshop-abr/v1', bytes: new Uint8Array() }
  });
  const settings = prepared.engine.settings;
  const values = settings.values;
  values.useTexture = source.textureEnabled === true;
  values.useDualBrush = dualBrush.enabled === true;
  const block = isBlockEraser(values.tool);
  const primaryResource = sampled && !block ? sampled : { ...prepared.resource, id: await assetId(prepared.resource) };
  let pattern: BrushResource | undefined;
  let dual: BrushResource | undefined;
  if (!block && values.useTexture) {
    pattern = await resource(d.texture?.resource ?? d.extensions?.[extensionId('texture')]?.resources?.[0] ?? '');
  }
  if (!block && values.useDualBrush) {
    const alias = (d.dual && d.tips[d.dual.tip]?.resource) ?? d.extensions?.[extensionId('dual-brush')]?.resources?.[0];
    if (alias || values.dualBrush.tipId) {
      dual = await resource(alias ?? '');
    } else {
      const image = decodePreviewResources({ dualHardness: values.dualBrush.hardness }).dualTip!;
      const coverage = { width: image.width, height: image.height, pixels: image.data };
      dual = { ...coverage, id: await assetId(coverage), format: 'r8unorm' };
    }
  }
  // The upload cache accepts one entry per content id, even when two sampler roles share it.
  const resources = Array.from(
    new Map([primaryResource, pattern, dual].filter((r) => r !== undefined).map((r) => [r.id, r])).values()
  );
  if (resources.reduce((bytes, image) => bytes + image.pixels.byteLength, 0) > 48 * 1024 * 1024) {
    throw new Error('ABR resources exceed the 48 MiB brush budget');
  }
  const smoothing = d.stroke?.smoothing ?? defaults.smoothing;
  if (
    smoothing !== 'none' &&
    smoothing !== 'studio' &&
    smoothing !== 'normal' &&
    smoothing !== 'smooth' &&
    smoothing !== 'stabilizer'
  ) {
    throw new Error('Unsupported Paint stroke correction: ' + smoothing);
  }
  if (d.mixing && d.mixing !== 'classic' && d.mixing !== 'linear') {
    throw new Error('Unsupported Paint color mixing: ' + d.mixing);
  }
  const stroke: Brush['stroke'] | undefined = d.stroke && {
    mode: smoothing,
    normal: d.stroke.normal ?? defaults.normal,
    smooth: d.stroke.smooth ?? defaults.smooth,
    catchUp: d.stroke.catchUp ?? defaults.catchUp,
    stabilizer: d.stroke.stabilizer ?? defaults.stabilizer
  };
  return {
    ...prepared,
    resource: primaryResource,
    resources,
    engine: {
      ...prepared.engine,
      settings: { ...settings, tipId: primaryResource.id, patternId: pattern?.id, dualId: dual?.id }
    },
    ...(stroke ? { stroke } : {}),
    ...(d.mixing ? { mixing: d.mixing } : {})
  };
}

/** Applies the studio's changed descriptor fields at their document addresses. */
export function patchAbrValues(text: string, values: BrushFormValues) {
  const doc = parseDocument(text, brushSchema);
  const d = doc.definition;
  const key = d.sequence.tips[0]!;
  const primary = d.tips[key]!;
  const before = descriptorFrom(d, primary);
  const asset: BrushAsset = {
    id: doc.id,
    name: doc.name,
    preset: { kind: 'brush', sourceId: doc.id, ...before },
    resources: [],
    source: { format: 'photoshop-abr/v1', bytes: new Uint8Array() }
  };
  const after = formValuesToBrush(asset, values).preset;
  function set(path: string[], value: unknown) {
    let node = d as Record<string, unknown>;
    const address = ['definition'];
    for (const [i, part] of path.entries()) {
      address.push(part);
      if (i === path.length - 1 || !node[part]) {
        const nested = path.slice(i + 1).reduceRight<unknown>((child, name) => ({ [name]: child }), value);
        node[part] = nested;
        text = patch(text, '/' + address.map((k) => k.replace(/~/g, '~0').replace(/\//g, '~1')).join('/'), nested);
        return;
      }
      node = record(node[part]);
    }
  }
  for (const [path, group] of new Map([
    ...fields,
    ...['diameter', 'angle', 'spacing', 'hardness', 'roundness'].map((k) => ['tip.' + k, 'tip'] as const)
  ])) {
    const read = (obj: unknown) => path.split('.').reduce<unknown>((node, k) => record(node)[k], obj);
    const value = read(after);
    if (value === undefined || JSON.stringify(value) === JSON.stringify(read(before))) {
      continue;
    }
    const dest = auxiliaryFields.get(path);
    if (path === 'tip.diameter') {
      set(['size'], value);
    } else if (path === 'tip.spacing') {
      fraction(['placement', 'spacing'], path, group, Number(value));
    } else if (['tip.angle', 'tip.hardness', 'tip.roundness'].includes(path)) {
      if (path === 'tip.angle') {
        set(['tips', key, 'angleDeg'], value);
      } else {
        fraction(['tips', key, path.slice(4)], path, group, Number(value));
      }
    } else if (dest && (dest.section === 'texture' ? d.texture : d.dual)) {
      const section = dest.section === 'tips/secondary' ? ['tips', d.dual!.tip] : [dest.section];
      if (dest.fraction) {
        fraction([...section, dest.key], path, group, Number(value));
      } else {
        set([...section, dest.key], value);
      }
    } else if (path === 'toolOptions.flow' || path === 'toolOptions.opacity') {
      fraction(['transfer', path.slice('toolOptions.'.length)], path, group, Number(value));
    } else {
      const section = path === 'textureBlendMode' ? 'texture' : path === 'dualBrush.blendMode' ? 'dual' : undefined;
      if (section && d[section]?.blend) {
        const { blend, ...remaining } = d[section]!;
        set([section], remaining);
      }
      setExtension(group, path, value);
    }
  }
  return text;

  function fraction(address: string[], path: string, group: string, value: number) {
    const scaled = value / 100;
    set(address, scaled);
    const residual = value - scaled * 100;
    const field = path + '.roundoff';
    if (residual || record(d.extensions?.[extensionId(group)]?.value)[field] !== undefined) {
      setExtension(group, field, residual);
    }
  }

  function setExtension(group: string, path: string, value: unknown) {
    const id = extensionId(group);
    if (!d.extensions?.[id]) {
      set(['extensions', id], { impact: 'appearance', value: {} });
    }
    set(['extensions', id, 'value', path], value);
  }
}

/**
 * The Photoshop form values of any brush document, Paint's round documents included: what the studio's Photoshop
 * groups read and {@link patchAbrValues} writes back. A Paint document reads its pressure bindings as Shape dynamics
 * and Transfer under Pen pressure, as the ABR adapter draws them.
 */
export function documentFormValues(document: BrushDocument): BrushFormValues {
  const d = document.definition;
  return brushToFormValues({
    name: document.name,
    preset: { kind: 'brush', sourceId: document.id, ...descriptorFrom(d, d.tips[d.sequence.tips[0]!]!) }
  } as Pick<BrushAsset, 'name' | 'preset'>);
}

/** Reconstructs the editable Photoshop fields. Standard sections take precedence over extension values. */
function descriptorFrom(d: Definition, primary: Definition['tips'][string]) {
  const source: Record<string, unknown> = {};
  function write(path: string, value: unknown) {
    const parts = path.split('.');
    const leaf = parts.pop()!;
    let parent = source;
    for (const key of parts) {
      parent = (parent[key] ??= {}) as Record<string, unknown>;
    }
    parent[leaf] = value;
  }
  function payload(group: string) {
    return record(d.extensions?.[extensionId(group)]?.value);
  }
  for (const [path, group] of fields) {
    const value = payload(group)[path];
    if (value !== undefined) {
      write(path, value);
    }
  }
  function percentage(value: number, path: string, group: string) {
    const residual = payload(group)[path + '.roundoff'];
    const base = value * 100;
    const corrected = base + Number(residual ?? 0);
    return corrected / 100 === value ? corrected : base;
  }
  if (d.texture) {
    write('textureEnabled', d.texture.enabled ?? true);
    if (d.texture.blend === 'photoshop-height-v1') {
      write('textureBlendMode', { domain: 'BlnM', value: 'Hght' });
    }
  }
  if (d.dual) {
    write('dualBrush.enabled', d.dual.enabled ?? true);
    if (d.dual.blend === 'multiply') {
      write('dualBrush.blendMode', { domain: 'BlnM', value: 'Mltp' });
    }
  }
  for (const [path, dest] of auxiliaryFields) {
    const section = dest.section === 'tips/secondary' ? d.dual && d.tips[d.dual.tip] : d[dest.section];
    const value = section?.[dest.key];
    if (value !== undefined) {
      write(path, dest.fraction && typeof value === 'number' ? percentage(value, path, fields.get(path)!) : value);
    }
  }
  const kind = primary.kind === 'photoshop.unresolved-sample' ? 'sampled' : primary.kind;
  write('tip.kind', kind === 'ellipse' || kind === 'round' ? 'computed' : kind);
  write('toolOptions.kind', toolCodes.get(d.tool) ?? d.tool.replace(/^photoshop\./, ''));
  write('tip.diameter', d.size);
  write('tip.angle', primary.angleDeg);
  write('tip.spacing', percentage(d.placement?.spacing ?? 0.25, 'tip.spacing', 'tip'));
  for (const key of ['hardness', 'roundness'] as const) {
    write('tip.' + key, percentage(primary[key] ?? 1, 'tip.' + key, 'tip'));
  }
  for (const key of ['flow', 'opacity'] as const) {
    const value = d.transfer?.[key];
    if (value !== undefined) {
      write('toolOptions.' + key, percentage(value, 'toolOptions.' + key, 'tool'));
    }
  }

  for (const key of ['foreground', 'background'] as const) {
    const hex = d.color?.[key];
    if (hex) {
      if (!/^#[0-9a-f]{6}$/i.test(hex)) {
        throw new Error('Unsupported ABR color: ' + hex);
      }
      const [red, green, blue] = hex
        .slice(1)
        .match(/../g)!
        .map((byte) => parseInt(byte, 16));
      write('toolOptions.' + key + 'Color', { kind: 'RGBC', red, green, blue });
    }
  }
  if ((d.placement?.law ?? defaults.placement.law) === 'paint-distance-v1') {
    const tool = record(source.toolOptions);
    tool.smoothing ??= false;
    if (d.dynamics?.some((binding) => binding.target === '/size') && source.shapeDynamicsEnabled === undefined) {
      source.shapeDynamicsEnabled = true;
      write('sizeDynamics.control', 2);
      source.minimumDiameter = 4;
    }
    if (d.dynamics?.some((binding) => binding.target === '/transfer/flow') && source.transferEnabled === undefined) {
      source.transferEnabled = true;
      write('flowDynamics.control', 2);
    }
    const native = record(d.extensions?.['paint.native-settings.v1']?.value);
    const angle = record(record(native.engine).settings).angle;
    if (primary.angleDeg === undefined && typeof angle === 'number') {
      write('tip.angle', (angle * 180) / Math.PI);
    }
  }
  return source;
}

function extensionId(group: string) {
  return 'photoshop.' + group + '.v1';
}

const toolNames = new Map(
  Object.entries({
    PbTl: 'brush',
    ErTl: 'eraser',
    PcTl: 'pencil',
    MixB: 'mixer',
    SmTl: 'smudge',
    BlTl: 'blur',
    ShTl: 'sharpen'
  })
);
const toolCodes = new Map(Array.from(toolNames, ([code, name]) => [name, code]));
for (const [alias, name] of Object.entries({
  eraserTool: 'eraser',
  pencilTool: 'pencil',
  mixerBrushTool: 'mixer',
  smudgeTool: 'smudge',
  blurTool: 'blur',
  sharpenTool: 'sharpen'
})) {
  toolNames.set(alias, name);
}

/** Shared descriptor paths (e.g. tip.physics) have one owner even across physical-tip panels. */
const fields = new Map<string, string>();
for (const [group, bindings] of Object.entries(settingGroups)) {
  const name = group.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
  for (const { path } of Object.values(bindings)) {
    if (!fields.has(path)) {
      fields.set(path, name);
    }
  }
}
for (const [key, { path }] of Object.entries(featureFields)) {
  const group = key
    .slice(3)
    .replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())
    .slice(1);
  fields.set(path, group);
}
for (const key of ['dtipsType', 'flipX', 'flipY', 'spacingEnabled', 'shape', 'physics']) {
  fields.set('tip.' + key, 'tip');
}
fields.set('toolOptions.buildUpEnabled', 'build-up');

/** Only fields with matching units and semantics use the common texture and secondary-tip sections. */
const auxiliaryFields = new Map<
  string,
  { section: 'texture' | 'dual' | 'tips/secondary'; key: string; fraction?: boolean }
>([
  ['textureEnabled', { section: 'texture', key: 'enabled' }],
  ['textureScale', { section: 'texture', key: 'scale', fraction: true }],
  ['textureDepth', { section: 'texture', key: 'depth', fraction: true }],
  ['dualBrush.enabled', { section: 'dual', key: 'enabled' }],
  ['dualBrush.tip.diameter', { section: 'dual', key: 'size' }],
  ['dualBrush.tip.spacing', { section: 'dual', key: 'spacing', fraction: true }],
  ['dualBrush.tip.hardness', { section: 'tips/secondary', key: 'hardness', fraction: true }],
  ['dualBrush.tip.roundness', { section: 'tips/secondary', key: 'roundness', fraction: true }],
  ['dualBrush.tip.angle', { section: 'tips/secondary', key: 'angleDeg' }]
]);

/** Versioned Photoshop extensions understood by the ABR adapter for compatibility queries. */
export const photoshopExtensions = Object.freeze(Array.from(new Set(fields.values()), extensionId));
