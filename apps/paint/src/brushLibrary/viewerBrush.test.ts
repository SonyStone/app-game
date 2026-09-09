import { pencilUsesBackground } from '@app-game/abr-brush/pencil';
import type { Brush } from '@app-game/abr-parser/reader';
import { expect, it } from 'vitest';
import { viewerBrush } from './viewerBrush';

it('native Pencil erasers ignore Flow and soft hardness while retaining opacity and Clear compositing', () => {
  for (const type of ['ErTl', 'eraserTool']) {
    const preset = viewerBrush({
      id: 'eraser-pencil',
      name: 'Pencil eraser',
      type: 'computed',
      spacing: 25,
      diameter: 32,
      hardness: 0,
      settings: { toolOptions: { __classId: type, ErsB: 2, flow: 1, Opct: 25 } }
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
    const preset = viewerBrush({
      id: 'pencil',
      name: 'Pencil',
      type: 'computed',
      spacing: 25,
      diameter: 16,
      hardness: 0,
      settings: { toolOptions: { __classId: type, flow: 1, Opct: 23, PncA: true } }
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
    type: 'sampled',
    settings: {},
    spacing: 25,
    diameter: 64,
    angle: 90,
    brushTip: { width: 2, height: 1, depth: 8, data: new Uint8Array([120, 255]) }
  };
  const snapshot = viewerBrush(brush);
  brush.brushTip!.data.fill(0);
  expect(snapshot.resource.pixels).toEqual(new Uint8Array([120, 255]));
  expect(snapshot.size).toBe(64);
  expect(snapshot.spacing).toBe(0.25);
  expect(snapshot.angle).toBeCloseTo(Math.PI / 2);
  expect(viewerBrush({ ...brush, diameter: 5000, spacing: 1000 }).size).toBe(5000);
  expect(() => viewerBrush({ ...brush, spacing: 0 })).toThrow();
  expect(snapshot.engine.id).toBe('abr');
});

it('generates computed tips and rejects oversized sampled resources before upload', () => {
  const brush: Brush = { id: 'a', name: 'Round', type: 'computed', spacing: 25, settings: {} };
  expect(viewerBrush(brush).resource.pixels.some((value) => value > 0)).toBe(true);
  expect(() =>
    viewerBrush({
      ...brush,
      type: 'sampled',
      brushTip: { width: 8193, height: 1, depth: 8, data: new Uint8Array(8193) }
    })
  ).toThrow('limit');
});

it('normalizes Mixer Brush aliases and keeps wet settings independent from ordinary stroke opacity', () => {
  for (const type of ['mixerBrushTool', 'MixB']) {
    const preset = viewerBrush({
      id: 'mixer',
      name: 'Mixer',
      type: 'computed',
      spacing: 25,
      settings: { toolOptions: { __classId: type, wetness: 30, dryness: 15, mix: 75, flow: 20, Opct: 5 } }
    });
    expect(preset.engine.settings.values.tool).toMatchObject({ type: 'MixB', wetness: 30, load: 15, mix: 75 });
    expect(preset.flow).toBe(0.2);
    expect(preset.opacity).toBe(1);
  }
});

it('applies an ABR eraser with Clear compositing and the saved flow and opacity', () => {
  const preset = viewerBrush({
    id: 'eraser',
    name: 'Eraser',
    type: 'computed',
    spacing: 25,
    settings: { toolOptions: { __classId: 'ErTl', flow: 35, Opct: 60 } }
  });
  expect(preset.engine.settings.blendMode).toBe('Cler');
  expect(preset.flow).toBe(0.35);
  expect(preset.opacity).toBe(0.6);
});

it('routes native filters with strength, mode, sampling and detail controls, without paint opacity/flow', () => {
  for (const type of ['BlTl', 'ShTl']) {
    const preset = viewerBrush({
      id: type,
      name: type,
      type: 'computed',
      spacing: 25,
      settings: {
        toolOptions: {
          __classId: type,
          'Prs ': 23,
          BlrS: true,
          detailBoost: false,
          Opct: 5,
          flow: 7,
          'Md  ': { type: 'BlnM', value: 'Lmns' }
        }
      }
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
  const brush: Brush = { id: 'colors', name: 'Colors', type: 'computed', spacing: 25, settings: {} };
  expect(viewerBrush(brush).color).toBeUndefined();
  expect(viewerBrush(brush).backgroundColor).toBeUndefined();
  brush.settings.toolOptions = {
    __classId: 'PbTl',
    FrgC: { __classId: 'RGBC', 'Rd  ': 18, 'Grn ': 52, 'Bl  ': 86 },
    BckC: { __classId: 'RGBC', 'Rd  ': 250, 'Grn ': 128, 'Bl  ': 64 }
  };
  const selected = viewerBrush(brush);
  expect(selected.color).toBe('#123456');
  expect(selected.backgroundColor).toBe('#fa8040');
  expect(selected.engine.settings.secondaryColor).toBe('#fa8040');
  brush.settings.toolOptions = { __classId: 'PbTl', FrgC: { __classId: 'LabC' } };
  expect(() => viewerBrush(brush)).toThrow('Unsupported saved foreground color');
});

it('routes native Smudge options and isolates Strength from the host paint flow/opacity', () => {
  const preset = viewerBrush({
    id: 'smudge',
    name: 'Smudge',
    type: 'computed',
    spacing: 25,
    settings: { toolOptions: { __classId: 'SmTl', 'Prs ': 63, SmdF: true, SmdS: true } }
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
