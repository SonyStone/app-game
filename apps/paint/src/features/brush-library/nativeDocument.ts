import type { Brush } from '@app-game/paint-core/brush';
import { compatibility } from '@app-game/paint-core/paintbrush/compatibility';
import {
  brushSchema,
  versionOneDefaults as defaults,
  type BrushDocument
} from '@app-game/paint-core/paintbrush/document';
import { z } from 'zod';
import type { BrushPreset } from './brushPresets';

/** Converts saved groups, including explicit engine overrides, into version-one definition paths. */
export function nativeDocument(preset: BrushPreset, resources?: BrushDocument['resources']): BrushDocument {
  const b = preset.settings;
  const engine = b.engine;
  if (engine && !['round', 'textured'].includes(engine.id)) {
    throw new Error('Unsupported brush engine: ' + engine.id);
  }
  const overrides = engineSettings(engine?.id ?? 'round').parse(engine?.settings ?? {});
  const sampled = engine?.id === 'textured';
  const apply = ['/tool', '/tips', '/sequence', '/placement'];
  const definition: BrushDocument['definition'] = {
    tool: b.tool ?? 'brush',
    tips: sampled
      ? { tip: { kind: 'sampled', resource: 'tip' } }
      : { round: { kind: 'round', hardness: overrides.hardness ?? b.hardness ?? 1 } },
    sequence: { order: 'cycle', tips: [sampled ? 'tip' : 'round'] },
    placement: { law: 'paint-distance-v1', spacing: overrides.spacing ?? b.spacing ?? defaults.placement.spacing }
  };
  if (b.size !== undefined) {
    definition.size = b.size;
    apply.push('/size');
  }
  if (b.flow !== undefined || b.opacity !== undefined) {
    definition.transfer = { flow: b.flow, opacity: b.opacity };
    apply.push('/transfer');
  }
  if (b.pressureSize !== undefined || b.pressureFlow !== undefined) {
    definition.dynamics = [
      ...(b.pressureSize ? [pressure('/size')] : []),
      ...(b.pressureFlow ? [pressure('/transfer/flow')] : [])
    ];
    apply.push('/dynamics');
  }
  if (b.stroke) {
    const { mode, ...levels } = b.stroke;
    definition.stroke = { smoothing: mode, ...levels };
    apply.push('/stroke');
  }
  if (b.mixing) {
    definition.mixing = b.mixing;
    apply.push('/mixing');
  }
  if (b.color || b.backgroundColor) {
    definition.renderHints = { color: b.color, backgroundColor: b.backgroundColor };
    apply.push('/renderHints');
  }
  // Engine overrides and sparse legacy presets distinguish an absent field from a saved default.
  if (
    engine ||
    b.tool === undefined ||
    b.hardness === undefined ||
    b.spacing === undefined ||
    (b.pressureSize === undefined) !== (b.pressureFlow === undefined) ||
    (b.flow === undefined) !== (b.opacity === undefined)
  ) {
    definition.extensions = {
      [nativeId]: {
        impact: 'tool',
        value: {
          keys: Object.keys(b),
          engine,
          hardness: b.hardness,
          spacing: b.spacing
        }
      }
    };
    apply.push('/extensions/' + nativeId);
  }
  return brushSchema.parse({
    id: preset.id,
    name: preset.name,
    derivedFrom: preset.derivedFrom,
    apply,
    definition,
    resources
  });
}

/** Returns native fields only when every appearance-affecting operation can be reproduced. */
export function resolveNative(doc: BrushDocument) {
  const result = compatibility(doc, [nativeId]);
  const reasons = result.reasons;
  const d = doc.definition;
  const tip = d.tips[d.sequence.tips[0]!]!;
  if (d.size !== undefined && (d.size < 1 || d.size > 512)) {
    reasons.push('Size outside native brush range (1–512 px)');
  }
  if (d.sequence.tips.length !== 1) {
    reasons.push('Alternating or multiple tips');
  }
  if (!['round', 'sampled'].includes(tip.kind)) {
    reasons.push('Unsupported tip geometry: ' + tip.kind);
  }
  if (d.placement && d.placement.law !== 'paint-distance-v1') {
    reasons.push('Placement law: ' + d.placement.law);
  }
  if (d.texture) {
    reasons.push('Texture: ' + (d.texture.blend ?? d.texture.resource));
  }
  if (d.dual) {
    reasons.push('Dual brush: ' + d.dual.tip);
  }
  if (d.stroke?.taper) {
    reasons.push('Stroke taper');
  }
  const targets = new Set<string>();
  for (const binding of d.dynamics ?? []) {
    if (
      !['/size', '/transfer/flow'].includes(binding.target) ||
      binding.input !== 'pressure' ||
      binding.op !== 'multiply' ||
      JSON.stringify(binding.domain) !== '[0,1]' ||
      JSON.stringify(binding.curve) !== '[[0,0],[1,1]]' ||
      targets.has(binding.target)
    ) {
      reasons.push(binding.input + ' binding on ' + binding.target);
    }
    targets.add(binding.target);
  }
  const paths = [
    '/tool',
    '/tips',
    '/sequence',
    '/placement',
    '/size',
    '/transfer',
    '/dynamics',
    '/stroke',
    '/mixing',
    '/renderHints',
    '/extensions/' + nativeId
  ];
  for (const path of doc.apply ?? []) {
    if (!paths.includes(path)) {
      reasons.push('Unsupported apply path: ' + path);
    }
  }
  if (doc.apply && !['/tool', '/tips', '/sequence', '/placement'].every((path) => doc.apply!.includes(path))) {
    reasons.push('Native presets always apply the tip group');
  }
  const hints = z
    .object({
      color: z
        .string()
        .regex(/^#[0-9a-f]{6}$/i)
        .optional(),
      backgroundColor: z
        .string()
        .regex(/^#[0-9a-f]{6}$/i)
        .optional()
    })
    .strict()
    .safeParse(d.renderHints ?? {});
  if (!hints.success) {
    reasons.push('Unsupported render hints');
  }
  const ref = tip.kind === 'sampled' ? doc.resources?.[tip.resource!] : undefined;
  if (tip.kind === 'sampled' && ref?.format !== 'r8') {
    return { status: 'unavailable' as const, reasons: ['Missing usable r8 tip: ' + tip.resource] };
  }
  if (result.status === 'unavailable' || reasons.length) {
    return { status: result.status === 'unavailable' ? ('unavailable' as const) : ('approximate' as const), reasons };
  }
  const uses = (path: string) => !doc.apply || doc.apply.includes(path);
  const settings: Partial<Brush> = {
    tool: d.tool as Brush['tool'],
    hardness: tip.hardness ?? 1,
    spacing: d.placement?.spacing ?? defaults.placement.spacing
  };
  if (ref) {
    settings.engine = { id: 'textured', settings: { tipId: ref.sha256 } };
  }
  if (uses('/size')) {
    settings.size = d.size ?? defaults.size;
  }
  if (uses('/transfer')) {
    settings.flow = d.transfer?.flow ?? defaults.flow;
    settings.opacity = d.transfer?.opacity ?? defaults.opacity;
  }
  if (uses('/dynamics')) {
    settings.pressureSize = targets.has('/size');
    settings.pressureFlow = targets.has('/transfer/flow');
  }
  if (uses('/stroke')) {
    settings.stroke = {
      mode: (d.stroke?.smoothing ?? defaults.smoothing) as Brush['stroke']['mode'],
      normal: d.stroke?.normal ?? defaults.normal,
      smooth: d.stroke?.smooth ?? defaults.smooth,
      stabilizer: d.stroke?.stabilizer ?? defaults.stabilizer,
      catchUp: d.stroke?.catchUp ?? defaults.catchUp
    };
  }
  if (uses('/mixing')) {
    settings.mixing = (d.mixing ?? defaults.mixing) as Brush['mixing'];
  }
  if (uses('/renderHints')) {
    Object.assign(settings, hints.data);
  }
  const ext = d.extensions?.[nativeId];
  if (ext && uses('/extensions/' + nativeId)) {
    const native = nativeFields.safeParse(ext.value);
    if (!native.success) {
      return { status: 'unavailable' as const, reasons: ['Invalid Paint native settings'] };
    }
    const { keys, engine, hardness, spacing } = native.data;
    if (engine) {
      if (
        !engineSettings(engine.id).safeParse(engine.settings ?? {}).success ||
        (engine.id === 'textured') !== (tip.kind === 'sampled')
      ) {
        return { status: 'unavailable' as const, reasons: ['Invalid Paint engine overrides'] };
      }
      settings.engine = { id: engine.id, settings: engine.settings };
    }
    if (tip.kind === 'sampled' && (!keys.includes('engine') || engine?.id !== 'textured')) {
      return { status: 'unavailable' as const, reasons: ['Sampled tip requires the textured engine'] };
    }
    Object.assign(settings, { hardness, spacing });
    for (const key of Object.keys(settings) as (keyof Brush)[]) {
      if (!keys.includes(key) || settings[key] === undefined) {
        delete settings[key];
      }
    }
  }
  return { status: 'supported' as const, settings, ref };
}

const nativeId = 'paint.native-settings.v1';
const nativeFields = z.object({
  keys: z.array(z.string()),
  engine: z
    .object({ id: z.enum(['round', 'textured']), settings: z.record(z.string(), z.json()).optional() })
    .optional(),
  hardness: z.number().min(0).max(1).optional(),
  spacing: z.number().positive().optional()
});

function engineSettings(id: string) {
  return z
    .object({
      tipId: id === 'textured' ? z.string().min(1).max(512) : z.never().optional(),
      angle: id === 'textured' ? z.number().optional() : z.never().optional(),
      hardness: id === 'round' ? z.number().min(0).max(1).optional() : z.never().optional(),
      spacing: z.number().min(0.01).max(1).optional()
    })
    .strict();
}

function pressure(target: string): NonNullable<BrushDocument['definition']['dynamics']>[number] {
  return {
    target,
    input: 'pressure',
    domain: [0, 1],
    curve: [
      [0, 0],
      [1, 1]
    ],
    op: 'multiply'
  };
}
