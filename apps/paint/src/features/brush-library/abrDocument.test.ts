import { loadBrushLibrary, type BrushAsset } from '@app-game/abr-brush/library';
import { createAbrStrokeSampler } from '@app-game/abr-brush/stroke';
import { prepareAbrBrush } from '@app-game/abr-paint/preset';
import { degrees, initAbr, percent, pixels, readLibrary } from '@app-game/abr-parser';
import { readArchive, writeArchive } from '@app-game/paint-core/paintbrush/archive';
import { assetId, encodePng } from '@app-game/paint-core/paintbrush/asset';
import { compatibility } from '@app-game/paint-core/paintbrush/compatibility';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { softRoundCandidate } from '../../../tests/fixtures/softRound';
import { abrDocument, photoshopExtensions, resolveAbr } from './abrDocument';
import { resolveNative } from './nativeDocument';

await initAbr();

function dabs(preset: ReturnType<typeof prepareAbrBrush>) {
  const sampler = createAbrStrokeSampler(
    {
      values: preset.engine.settings.values,
      size: preset.size,
      color: preset.color ?? '#14668c',
      secondaryColor: preset.engine.settings.secondaryColor,
      flow: preset.flow ?? 1,
      opacity: preset.opacity ?? 1,
      seed: 984321,
      sampledTipGeometry: true
    },
    preset.resource
  );
  return sampler.add([
    { x: 1, y: 2, pressure: 0.35, tiltX: 20, tiltY: 13, rotation: 0, time: 0 },
    { x: 63, y: 47, pressure: 0.94, tiltX: -15, tiltY: 27, rotation: 52, time: 40 }
  ]);
}

async function compare(actual: ReturnType<typeof prepareAbrBrush>, expected: ReturnType<typeof prepareAbrBrush>) {
  const ids = new Map(await Promise.all(expected.resources.map(async (r) => [r.id, await assetId(r)] as const)));
  const { resource, resources, engine, ...controls } = expected;
  const { resource: tip, resources: images, engine: resolved, ...resolvedControls } = actual;
  expect(resolvedControls).toEqual(controls);
  expect(resolved).toEqual({
    ...engine,
    settings: {
      ...engine.settings,
      tipId: ids.get(engine.settings.tipId),
      dualId: ids.get(engine.settings.dualId ?? ''),
      patternId: ids.get(engine.settings.patternId ?? '')
    }
  });
  expect(tip.id).toBe(ids.get(resource.id));
  expect(images.map((image) => image.id)).toEqual([...new Set(ids.values())]);
  for (const original of resources) {
    const image = images.find((candidate) => candidate.id === ids.get(original.id))!;
    expect([image.width, image.height, image.format]).toEqual([original.width, original.height, original.format]);
    expect(Buffer.from(image.pixels).equals(original.pixels)).toBe(true);
  }
  expect(dabs(actual)).toEqual(dabs(expected));
}

const root = resolve(import.meta.dirname, '../../../../..');
const fixtureDirs = ['files', 'fixtures/original-roundtrip', 'tests/fixtures/researched/containers'].map((path) =>
  resolve(root, 'packages/abr-parser', path)
);
const directories = process.env.ABR_FIXTURE_DIRECTORY ? [process.env.ABR_FIXTURE_DIRECTORY] : fixtureDirs;

it.each(directories)(
  'matches each preparable fixture in %s',
  async (directory) => {
    const tips: Record<string, number> = {},
      tools: Record<string, number> = {};
    let rejectedFiles = 0,
      rejectedPresets = 0,
      prepared = 0;
    for (const file of readdirSync(directory).filter((name) => name.endsWith('.abr'))) {
      let brushes: BrushAsset[];
      try {
        brushes = loadBrushLibrary(readFileSync(resolve(directory, file))).brushes;
      } catch (error) {
        if (process.env.ABR_FIXTURE_REPORT) {
          process.stdout.write(file + ': ' + String(error) + '\n');
        }
        rejectedFiles++;
        continue;
      }
      for (const brush of brushes) {
        let baseline: ReturnType<typeof prepareAbrBrush>;
        try {
          baseline = prepareAbrBrush(brush);
        } catch (error) {
          if (process.env.ABR_FIXTURE_REPORT) {
            process.stdout.write(brush.name + ': ' + String(error) + '\n');
          }
          rejectedPresets++;
          continue;
        }
        const { document, assets } = await roundTrip(await abrDocument(brush));
        await compare(await resolveAbr(document, assets), baseline);
        const rawKind = brush.preset.tip?.kind ?? 'computed';
        const kind = rawKind === 'naturalMedia' ? (brush.preset.tip?.dtipsType ? 'airbrush' : 'erodible') : rawKind;
        tips[kind] = (tips[kind] ?? 0) + 1;
        tools[document.definition.tool] = (tools[document.definition.tool] ?? 0) + 1;
        prepared++;
      }
    }
    process.stdout.write(JSON.stringify({ directory, prepared, rejectedFiles, rejectedPresets, tips, tools }) + '\n');
    const index = fixtureDirs.indexOf(directory);
    if (index >= 0) {
      expect([prepared, rejectedFiles, rejectedPresets]).toEqual(
        [
          [114, 0, 9],
          [100, 2, 6],
          [119, 0, 8]
        ][index]
      );
    } else {
      expect(prepared).toBeGreaterThan(0);
    }
  },
  600000
);

function synthetic(kind: string, tool: string, variant = 0): BrushAsset {
  return {
    name: 'Fixture',
    id: 'source',
    source: { format: 'photoshop-abr/v1', bytes: new Uint8Array() },
    resources: [],
    tipImage: { width: 2, height: 1, depth: 8, sourceDepth: 8, data: Uint8Array.of(47, 255) },
    preset: {
      kind: 'brush',
      sourceId: 'preset',
      tip: {
        kind,
        angle: degrees(13),
        diameter: pixels(17),
        hardness: percent(57),
        roundness: percent(61),
        spacing: percent(56.00000000000001),
        dtipsType: variant,
        dtipsLengthRatio: percent(73),
        density: percent(0.37)
      },
      toolOptions: { kind: tool, opacity: 57, flow: 13, smoothingValue: 23 },
      shapeDynamicsEnabled: false,
      minimumDiameter: percent(37),
      noiseEnabled: true,
      wetEdgesEnabled: true,
      protectTexture: true,
      buildUpEnabled: true,
      count: 3,
      textureDepth: percent(27),
      dualBrush: { kind: 'dualBrush', enabled: false, count: 4 },
      hue: percent(17),
      opacityDynamics: { kind: 'dynamics', jitter: percent(13) },
      brushPosePressure: percent(45)
    }
  };
}

it.each([
  ['computed', 'PbTl'],
  ['sampled', 'eraserTool'],
  ['bristle', 'PcTl'],
  ['naturalMedia', 'MixB'],
  ['naturalMedia', 'SmTl', 1],
  ['computed', 'BlTl'],
  ['computed', 'ShTl']
] as const)('archives %s and %s with all dormant fields', async (kind, tool, variant: number = 0) => {
  const brush = synthetic(kind, tool, variant);
  const { document, assets } = await abrDocument(brush);
  document.definition.extensions!['other.future.v2'] = { impact: 'metadata', value: { label: 'retained' } };
  const archive = await roundTrip({ document, assets });
  const copy = archive.document;
  expect(copy.definition.extensions).toEqual(document.definition.extensions);
  expect(copy.origin?.mappings.every((mapping) => mapping.outcome === 'exact')).toBe(true);
  await compare(await resolveAbr(copy, archive.assets), prepareAbrBrush(brush));
  expect(compatibility(copy, photoshopExtensions)).toEqual({ status: 'supported', reasons: [] });
  const native = resolveNative(copy);
  expect(native.reasons).toContain(
    ['brush', 'eraser'].includes(copy.definition.tool)
      ? 'Placement law: photoshop-v1'
      : 'Unsupported native marking tool: ' + copy.definition.tool
  );
  expect(native.status).toBe(['brush', 'eraser'].includes(copy.definition.tool) ? 'approximate' : 'unavailable');
  copy.id = 'copy';
  copy.name = 'Edited';
  copy.definition.size = 21;
  Object.assign(copy.definition.extensions!['photoshop.shape-dynamics.v1']!.value as object, {
    shapeDynamicsEnabled: true
  });
  const edited = await resolveAbr(copy, archive.assets);
  expect(edited.engine.settings.values).toMatchObject({
    name: 'Edited',
    diameter: 21,
    useShapeDynamics: true,
    shapeDynamics: { minimumDiameter: percent(37) }
  });
  await compare(
    edited,
    prepareAbrBrush({
      ...brush,
      name: 'Edited',
      preset: { ...brush.preset, shapeDynamicsEnabled: true, tip: { ...brush.preset.tip!, diameter: pixels(21) } }
    })
  );
});

it('retains both disabled sampled effects and re-enables them from the archive pixels', async () => {
  const container = (file: string) => readLibrary(readFileSync(resolve(fixtureDirs[2]!, file))).resources[0]!;
  const pattern = container('patterns2-gray-alpha-opaque.abr');
  const sample = container('samples2-m6l2.abr');
  const brush = synthetic('computed', 'PbTl');
  const dual = {
    kind: 'dualBrush',
    enabled: false,
    tip: { kind: 'sampled', sampleId: sample.resource.id, diameter: pixels(12) }
  };
  brush.resources = [sample, pattern];
  brush.preset = {
    ...brush.preset,
    textureEnabled: false,
    texture: { kind: 'pattern', identifier: pattern.resource.id },
    dualBrush: dual
  };
  const { document, assets } = await abrDocument(brush, {
    mixing: 'classic',
    stroke: { mode: 'stabilizer', stabilizer: 9, normal: 1, smooth: 10, catchUp: true }
  });
  const { mixing, stroke, ...before } = await resolveAbr(document, assets);
  expect(mixing).toBe('classic');
  expect(stroke).toMatchObject({ mode: 'stabilizer', stabilizer: 9 });
  expect(before.engine.settings.values.smoothing.amount).toBe(23);
  await compare(before, prepareAbrBrush(brush));
  document.definition.texture!.enabled = true;
  document.definition.dual!.enabled = true;
  const { mixing: _mixing, stroke: _stroke, ...after } = await resolveAbr(document, assets);
  expect(after.engine.settings.patternId).toBeDefined();
  expect(after.engine.settings.dualId).toBeDefined();
  await compare(
    after,
    prepareAbrBrush({
      ...brush,
      preset: { ...brush.preset, textureEnabled: true, dualBrush: { ...dual, enabled: true } }
    })
  );
});

it('retains the missing dormant sample of a block eraser', async () => {
  const brush = synthetic('sampled', 'ErTl');
  delete brush.tipImage;
  brush.preset.toolOptions = { kind: 'ErTl', eraserMode: 3 };
  const { document, assets } = await abrDocument(brush);
  await compare(await resolveAbr(document, assets), prepareAbrBrush(brush));
  document.definition.tool = 'brush';
  await expect(resolveAbr(document, assets)).rejects.toThrow('sampled brush tip is missing');
});

async function roundTrip({ document, assets }: Awaited<ReturnType<typeof abrDocument>>) {
  const file = 'brushes/a.json';
  const bytes = writeArchive(
    JSON.stringify({ format: 'paintbrush', version: [1, 0], minReader: [1, 0], brushes: [{ file }] }),
    new Map([[file, JSON.stringify(document)]]),
    new Map(Array.from(assets, ([id, image]) => ['assets/' + id + '.png', encodePng(image)]))
  );
  const archive = await readArchive(bytes);
  if (archive.status !== 'editable') {
    throw new Error(archive.reason);
  }
  return { document: archive.brushes[0]!.view, assets: archive.assets };
}

it('reads legacy extension fields until a section supplies their value', async () => {
  const { document, assets } = await abrDocument(synthetic('computed', 'PbTl'));
  const fields = (document.definition.extensions!['photoshop.tool.v1'] ??= { impact: 'appearance', value: {} });
  Object.assign(fields.value as object, { 'toolOptions.opacity': 43 });
  expect((await resolveAbr(document, assets)).engine.settings.values.tool.opacity).toBe(57);
  delete document.definition.transfer!.opacity;
  expect((await resolveAbr(document, assets)).engine.settings.values.tool.opacity).toBe(43);
});

it.each([
  [32, false, 0.35],
  [4, false, 0.35],
  [32, true, 1],
  [32, true, 0.35]
] as const)('reproduces Paint’s soft-round reference at %i px, erase %s, flow %f', async (size, erase, flow) => {
  const { brush: _host, ...baseline } = softRoundCandidate(size, erase, flow);
  const source: BrushAsset = {
    id: 'reference',
    name: baseline.name,
    source: { format: 'photoshop-abr/v1', bytes: new Uint8Array() },
    resources: [],
    preset: {
      kind: 'brush',
      sourceId: 'fixture',
      tip: { kind: 'computed', diameter: pixels(size), spacing: percent(12), hardness: percent(65) },
      shapeDynamicsEnabled: true,
      minimumDiameter: percent(4),
      sizeDynamics: { kind: 'dynamics', control: 2 },
      toolOptions: { kind: erase ? 'ErTl' : 'PbTl', flow: flow * 100, opacity: 100, smoothing: false }
    }
  };
  const { document, assets } = await roundTrip(await abrDocument(source));
  await compare(await resolveAbr(document, assets), baseline);
});
