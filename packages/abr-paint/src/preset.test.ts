import type { BrushAsset as Brush } from '@app-game/abr-brush/library';
import { pencilUsesBackground } from '@app-game/abr-brush/pencil';
import { degrees, percent, pixels } from '@app-game/abr-parser';
import { expect, it } from 'vitest';
import { prepareAbrBrush } from './preset';

it('native Pencil erasers ignore Flow and soft hardness while retaining opacity and Clear compositing', () => {
  for (const type of ['ErTl', 'eraserTool']) {
    const preset = prepareAbrBrush({
      id: 'eraser-pencil',
      name: 'Pencil eraser',
      preset: {
        kind: 'brush',
        sourceId: 'fixture',
        ...{ toolOptions: { kind: type, eraserMode: 2, flow: 1, opacity: 25 } },
        tip: { kind: 'computed', diameter: pixels(32), spacing: percent(25), hardness: percent(0) }
      },
      resources: [],
      source: { format: 'photoshop-abr/v1' as const, bytes: new Uint8Array() }
    });
    expect(preset.engine.settings.blendMode).toBe('Cler');
    expect(preset.engine.settings.values.tool).toMatchObject({ type: 'ErTl', eraserMode: 2, flow: 1 });
    expect(preset.flow).toBe(1);
    expect(preset.opacity).toBe(0.25);
    expect(preset.resource.pixels[64 * 128 + 32]).toBe(255);
  }
});

it('Pencil ignores dormant Flow and soft hardness without overwriting saved settings', () => {
  for (const type of ['PcTl', 'pencilTool']) {
    const preset = prepareAbrBrush({
      id: 'pencil',
      name: 'Pencil',
      preset: {
        kind: 'brush',
        sourceId: 'fixture',
        ...{ toolOptions: { kind: type, flow: 1, opacity: 23, autoErase: true } },
        tip: { kind: 'computed', diameter: pixels(16), spacing: percent(25), hardness: percent(0) }
      },
      resources: [],
      source: { format: 'photoshop-abr/v1' as const, bytes: new Uint8Array() }
    });
    expect(preset.engine.settings.values.tool).toMatchObject({ type: 'PcTl', flow: 1, autoErase: true });
    expect(preset.flow).toBe(1);
    expect(preset.opacity).toBe(0.23);
    expect(preset.engine.settings.values.hardness).toBe(0);
    expect(preset.resource.pixels[64 * 128 + 32]).toBe(255);
  }
});

it('Auto Erase distinguishes opaque foreground from transparent or different pixels', () => {
  expect(pencilUsesBackground([255, 0, 0, 255], '#ff0000')).toBe(true);
  expect(pencilUsesBackground([0, 0, 0, 0], '#000000')).toBe(false);
  expect(pencilUsesBackground([127, 0, 0, 127], '#ff0000')).toBe(false);
  expect(pencilUsesBackground([255, 0, 1, 255], '#ff0000')).toBe(false);
});

it('copies edited coverage and maps supported viewer settings without retaining mutable preset data', () => {
  const brush: Brush = {
    id: 'a',
    name: 'Ink',
    preset: {
      kind: 'brush',
      sourceId: 'fixture',
      ...{},
      tip: { kind: 'sampled', diameter: pixels(64), spacing: percent(25), angle: degrees(90) }
    },
    resources: [],
    source: { format: 'photoshop-abr/v1' as const, bytes: new Uint8Array() },
    tipImage: { width: 2, height: 1, depth: 8, sourceDepth: 8, data: new Uint8Array([120, 255]) }
  };
  const snapshot = prepareAbrBrush(brush);
  brush.tipImage!.data.fill(0);
  expect(snapshot.resource.pixels).toEqual(new Uint8Array([120, 255]));
  expect(snapshot.size).toBe(64);
  expect(snapshot.spacing).toBe(0.25);
  expect(snapshot.angle).toBeCloseTo(Math.PI / 2);
  expect(
    prepareAbrBrush({
      ...brush,
      preset: { ...brush.preset, tip: { ...brush.preset.tip!, diameter: pixels(5000), spacing: percent(1000) } }
    }).size
  ).toBe(5000);
  expect(() =>
    prepareAbrBrush({ ...brush, preset: { ...brush.preset, tip: { ...brush.preset.tip!, spacing: percent(0) } } })
  ).toThrow();
  expect(snapshot.engine.id).toBe('abr');
});

it('generates computed tips and rejects oversized sampled resources before upload', () => {
  const brush: Brush = {
    id: 'a',
    name: 'Round',
    preset: { kind: 'brush', sourceId: 'fixture', ...{}, tip: { kind: 'computed', spacing: percent(25) } },
    resources: [],
    source: { format: 'photoshop-abr/v1' as const, bytes: new Uint8Array() }
  };
  expect(prepareAbrBrush(brush).resource.pixels.some((value) => value > 0)).toBe(true);
  expect(() =>
    prepareAbrBrush({
      ...brush,
      preset: { ...brush.preset, tip: { kind: 'sampled' } },
      tipImage: { width: 8193, height: 1, depth: 8, sourceDepth: 8, data: new Uint8Array(8193) }
    })
  ).toThrow('limit');
});

it('normalizes Mixer Brush aliases and keeps wet settings independent from ordinary stroke opacity', () => {
  for (const type of ['mixerBrushTool', 'MixB']) {
    const preset = prepareAbrBrush({
      id: 'mixer',
      name: 'Mixer',
      preset: {
        kind: 'brush',
        sourceId: 'fixture',
        ...{ toolOptions: { kind: type, wetness: 30, dryness: 15, mix: 75, flow: 20, opacity: 5 } },
        tip: { kind: 'computed', spacing: percent(25) }
      },
      resources: [],
      source: { format: 'photoshop-abr/v1' as const, bytes: new Uint8Array() }
    });
    expect(preset.engine.settings.values.tool).toMatchObject({ type: 'MixB', wetness: 30, load: 15, mix: 75 });
    expect(preset.flow).toBe(0.2);
    expect(preset.opacity).toBe(1);
  }
});

it('applies an ABR eraser with Clear compositing and the saved flow and opacity', () => {
  const preset = prepareAbrBrush({
    id: 'eraser',
    name: 'Eraser',
    preset: {
      kind: 'brush',
      sourceId: 'fixture',
      ...{ toolOptions: { kind: 'ErTl', flow: 35, opacity: 60 } },
      tip: { kind: 'computed', spacing: percent(25) }
    },
    resources: [],
    source: { format: 'photoshop-abr/v1' as const, bytes: new Uint8Array() }
  });
  expect(preset.engine.settings.blendMode).toBe('Cler');
  expect(preset.flow).toBe(0.35);
  expect(preset.opacity).toBe(0.6);
});

it('routes native filters with strength, mode, sampling and detail controls, without paint opacity/flow', () => {
  for (const type of ['BlTl', 'ShTl']) {
    const preset = prepareAbrBrush({
      id: type,
      name: type,
      preset: {
        kind: 'brush',
        sourceId: 'fixture',
        ...{
          toolOptions: {
            kind: type,
            strength: 23,
            filterAllLayers: true,
            detailBoost: false,
            opacity: 5,
            flow: 7,
            mode: { domain: 'BlnM', value: 'Lmns' }
          }
        },
        tip: { kind: 'computed', spacing: percent(25) }
      },
      resources: [],
      source: { format: 'photoshop-abr/v1' as const, bytes: new Uint8Array() }
    });
    expect(preset.engine.settings.values.tool).toMatchObject({
      type,
      strength: 23,
      sharpenAllLayers: true,
      protectDetail: false
    });
    expect(preset.engine.settings.blendMode).toBe('Lmns');
    expect(preset.opacity).toBe(1);
    expect(preset.flow).toBe(1);
  }
});

it('applies saved foreground and background colors without inventing a saved foreground for other presets', () => {
  const brush: Brush = {
    id: 'colors',
    name: 'Colors',
    preset: { kind: 'brush', sourceId: 'fixture', ...{}, tip: { kind: 'computed', spacing: percent(25) } },
    resources: [],
    source: { format: 'photoshop-abr/v1' as const, bytes: new Uint8Array() }
  };
  expect(prepareAbrBrush(brush).color).toBeUndefined();
  expect(prepareAbrBrush(brush).backgroundColor).toBeUndefined();
  brush.preset.toolOptions = {
    kind: 'PbTl',
    foregroundColor: { kind: 'RGBC', red: 18, green: 52, blue: 86 },
    backgroundColor: { kind: 'RGBC', red: 250, green: 128, blue: 64 }
  };
  const selected = prepareAbrBrush(brush);
  expect(selected.color).toBe('#123456');
  expect(selected.backgroundColor).toBe('#fa8040');
  expect(selected.engine.settings.secondaryColor).toBe('#fa8040');
  brush.preset.toolOptions = { kind: 'PbTl', foregroundColor: { kind: 'LabC' } };
  expect(() => prepareAbrBrush(brush)).toThrow('Unsupported saved foreground color');
});

it('routes native Smudge options and isolates Strength from the host paint flow/opacity', () => {
  const preset = prepareAbrBrush({
    id: 'smudge',
    name: 'Smudge',
    preset: {
      kind: 'brush',
      sourceId: 'fixture',
      ...{ toolOptions: { kind: 'SmTl', strength: 63, fingerPainting: true, smudgeAllLayers: true } },
      tip: { kind: 'computed', spacing: percent(25) }
    },
    resources: [],
    source: { format: 'photoshop-abr/v1' as const, bytes: new Uint8Array() }
  });
  expect(preset.engine.settings.values.tool).toMatchObject({
    type: 'SmTl',
    strength: 63,
    fingerPainting: true,
    smudgeAllLayers: true
  });
  expect(preset.flow).toBe(1);
  expect(preset.opacity).toBe(1);
});
