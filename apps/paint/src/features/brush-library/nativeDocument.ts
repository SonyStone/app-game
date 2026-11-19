import { featureFields } from '@app-game/abr-brush/settings-fields';
import type { Brush } from '@app-game/paint-core/brush';
import { compatibility } from '@app-game/paint-core/paintbrush/compatibility';
import {
  brushSchema,
  versionOneDefaults as defaults,
  parseDocument,
  patch,
  patchList,
  type BrushDocument
} from '@app-game/paint-core/paintbrush/document';
import { z } from 'zod';
import type { BrushPreset } from './brushPresets';

/** Materializes the runtime settings from a round preset's saved document. */
export function readRoundPreset<T extends BrushPreset>(
  preset: T,
  text = nativePresetText(preset)
): T & { nativeDocument: string } {
  const doc = parseDocument(text, brushSchema);
  const resolved = chooseRenderPath(doc);
  if (resolved.path !== 'round' || resolved.status !== 'supported') {
    throw new Error(resolved.reasons.join(', '));
  }

  if (doc.id !== preset.id) {
    throw new Error('Expected a round document for ' + preset.id);
  }

  return { ...preset, nativeDocument: text, settings: resolved.settings };
}

/** Serializes saved groups while preserving opaque fields and exact JSON numbers from imported files. */
export function nativePresetText(preset: BrushPreset, resources?: BrushDocument['resources']): string {
  const kept = preset.paintbrush;
  const current = nativeDocument(preset, resources);
  let text = JSON.stringify(current);
  if (kept) {
    const original = parseDocument(kept.text, brushSchema);
    const baseline = nativeDocument(
      { ...preset, settings: kept.baseline, id: original.id, name: original.name, derivedFrom: original.derivedFrom },
      resources
    );
    const key = original.definition.sequence.tips[0]!;
    for (const generated of [current, baseline]) {
      const name = generated.definition.sequence.tips[0]!;
      if (key !== name) {
        generated.definition.tips = { [key]: generated.definition.tips[name]! };
        generated.definition.sequence.tips = [key];
      }
    }
    text = kept.text;
    function change(before: unknown, after: unknown, path: string[]) {
      if (after === undefined || JSON.stringify(before) === JSON.stringify(after)) {
        return;
      }
      const target = path.reduce<unknown>(
        (node, key) =>
          node && typeof node === 'object' && Object.hasOwn(node, key)
            ? (node as Record<string, unknown>)[key]
            : undefined,
        original
      );
      if (path.join('/') === 'definition/dynamics' && Array.isArray(target) && Array.isArray(after)) {
        text = patchList(
          text,
          path,
          after.map((binding) => {
            const keep = target.findIndex((previous) => previous.target === binding.target);
            return keep >= 0 ? { keep } : { add: binding };
          })
        );
        return;
      }
      if (target && typeof target === 'object' && after && typeof after === 'object' && !Array.isArray(after)) {
        for (const [key, value] of Object.entries(after)) {
          change((before as Record<string, unknown> | undefined)?.[key], value, [...path, key]);
        }
        return;
      }
      text = patch(text, '/' + path.map((key) => key.replace(/~/g, '~0').replace(/\//g, '~1')).join('/'), after);
    }
    change(baseline, current, []);
  }
  return text;
}

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
      ...(b.pressureSize ? [pressureBinding('/size')] : []),
      ...(b.pressureFlow ? [pressureBinding('/transfer/flow')] : [])
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
    definition.color = { foreground: b.color, background: b.backgroundColor };
    apply.push('/color');
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

/** Synchronous decision shared by round tool slots and document preparation, before reading any coverage. */
export function chooseRenderPath(doc: BrushDocument) {
  const native = resolveNative(doc);
  if (native.status === 'supported' && !native.ref) {
    return { path: 'round' as const, status: native.status, reasons: [], settings: native.settings };
  }
  const reasons = native.status === 'supported' ? ['Sampled tip'] : native.reasons;
  return { path: 'abr' as const, reasons };
}

/** Returns native fields only when every appearance-affecting operation can be reproduced. */
export function resolveNative(
  doc: BrushDocument
):
  | Extract<ReturnType<typeof paintDocumentFields>, { status: 'supported' }>
  | { status: 'approximate' | 'unavailable'; reasons: string[]; settings?: undefined; ref?: undefined } {
  const d = doc.definition;
  const inactive = Object.entries(d.extensions ?? {}).flatMap(([id, extension]) => {
    const field = featureSwitches.get(id);
    const payload = extension.value;
    return field && payload && typeof payload === 'object' && Reflect.get(payload, field) === false ? [id] : [];
  });
  const result = compatibility(doc, [nativeId, ...inactive]);
  const reasons = result.reasons;
  if (result.status !== 'unavailable' && !['brush', 'eraser'].includes(d.tool)) {
    return { status: 'unavailable' as const, reasons: ['Unsupported native marking tool: ' + d.tool] };
  }
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
  if (tip.kind === 'round' && (tip.roundness ?? 1) !== 1) {
    reasons.push('Non-circular round tip');
  }
  if (d.placement && d.placement.law !== 'paint-distance-v1') {
    reasons.push('Placement law: ' + d.placement.law);
  }
  if (d.texture && d.texture.enabled !== false) {
    reasons.push('Texture: ' + (d.texture.blend ?? d.texture.resource));
  }
  if (d.dual && d.dual.enabled !== false) {
    reasons.push('Dual brush: ' + d.dual.tip);
  }
  if (d.stroke?.taper) {
    reasons.push('Stroke taper');
  }
  const targets = new Set<string>();
  for (const binding of d.dynamics ?? []) {
    if (!isPaintPressureBinding(binding) || targets.has(binding.target)) {
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
    '/color',
    '/extensions/' + nativeId,
    ...inactive.map((id) => '/extensions/' + id),
    ...(d.dual?.enabled === false ? ['/dual'] : []),
    ...(d.texture?.enabled === false ? ['/texture'] : [])
  ];
  for (const path of doc.apply ?? []) {
    if (!paths.includes(path)) {
      reasons.push('Unsupported apply path: ' + path);
    }
  }
  if (doc.apply && !['/tool', '/tips', '/sequence', '/placement'].every((path) => doc.apply!.includes(path))) {
    reasons.push('Native presets always apply the tip group');
  }
  const fields = paintDocumentFields(doc);
  if (fields.status !== 'supported') {
    return { status: fields.status, reasons: [...reasons, ...fields.reasons] };
  }
  if (result.status === 'unavailable' || reasons.length) {
    return { status: result.status === 'unavailable' ? ('unavailable' as const) : ('approximate' as const), reasons };
  }
  return fields;
}

/** Projects the included Paint host groups. Renderer eligibility is checked separately by each adapter. */
export function paintDocumentFields(doc: BrushDocument) {
  const d = doc.definition;
  const tip = d.tips[d.sequence.tips[0]!]!;
  const targets = new Set(d.dynamics?.map((binding) => binding.target));
  const colors = z
    .object({
      foreground: z
        .string()
        .regex(/^#[0-9a-f]{6}$/i)
        .optional(),
      background: z
        .string()
        .regex(/^#[0-9a-f]{6}$/i)
        .optional()
    })
    .strict()
    .safeParse(d.color ?? {});
  if (!colors.success) {
    return { status: 'approximate' as const, reasons: ['Unsupported brush colors'] };
  }
  const ref = tip.kind === 'sampled' ? doc.resources?.[tip.resource!] : undefined;
  if (tip.kind === 'sampled' && ref?.format !== 'r8') {
    return { status: 'unavailable' as const, reasons: ['Missing usable r8 tip: ' + tip.resource] };
  }
  const uses = (path: string) => !doc.apply || doc.apply.includes(path);
  const settings: Partial<Brush> = {
    tool: d.tool === 'eraser' ? 'eraser' : 'brush',
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
  if (uses('/color')) {
    if (colors.data.foreground) {
      settings.color = colors.data.foreground;
    }

    if (colors.data.background) {
      settings.backgroundColor = colors.data.background;
    }
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

const featureSwitches = new Map(
  Object.entries(featureFields).map(([name, field]) => [
    'photoshop.' +
      name
        .slice(3)
        .replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())
        .slice(1) +
      '.v1',
    field.path
  ])
);

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

/** Identity pressure binding used by Paint's diameter and flow controls. */
export function pressureBinding(target: string): NonNullable<BrushDocument['definition']['dynamics']>[number] {
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

/** Both renderers translate these identity pressure bindings on size and flow. */
export function isPaintPressureBinding(binding: ReturnType<typeof pressureBinding>) {
  return (
    ['/size', '/transfer/flow'].includes(binding.target) &&
    binding.input === 'pressure' &&
    binding.op === 'multiply' &&
    JSON.stringify(binding.domain) === '[0,1]' &&
    JSON.stringify(binding.curve) === '[[0,0],[1,1]]'
  );
}
