import { createAbrStrokeSampler } from '@app-game/abr-brush/stroke';
import { AbrParser, readPatternIndex } from '@app-game/abr-parser/browser';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { viewerBrush } from '../brushLibrary/viewerBrush';

it('applies all bundled HSB-color presets without replacing their native color descriptors', () => {
  const file = new AbrParser().parse(readFileSync(new URL('../../../abr-viewer/src/assets/examples/megapack.abr', import.meta.url)));
  const patterns = readPatternIndex(file.rawPatternData!);
  for (const [name, color] of [
    ["Kyle's FX Box - Add Canvas New", '#9e9e9e'],
    ["Kyle's Paintbox - Gesso Thin", '#f6f5f2'],
    ["Kyle's Paintbox - Gesso Regular", '#f6f5f2'],
    ["Kyle's Paintbox - Gesso Thick", '#f6f6f2']
  ]) {
    const brush = file.brushes.find((brush) => brush.name === name)!;
    expect(brush).toBeDefined();
    const saved = structuredClone(brush.settings.toolOptions);
    const preset = viewerBrush({ ...brush, patternResources: patterns } as Parameters<typeof viewerBrush>[0]);
    expect(preset.color).toBe(color);
    expect(preset.engine.settings.values.tool.foreground).toBe(color);
    expect(brush.settings.toolOptions).toEqual(saved);
  }
});

it('imports embedded example presets with their full dynamics and auxiliary resources', () => {
  const bytes = readFileSync(new URL('../../../abr-viewer/src/assets/examples/halftones_and_screentones.abr', import.meta.url));
  const file = new AbrParser().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const brush = file.brushes.find((brush) => brush.name === "Kyle's Halftone - Circle Range Tiny")!;
  expect(brush).toBeDefined();
  const preset = viewerBrush({ ...brush, patternResources: readPatternIndex(file.rawPatternData!) } as Parameters<
    typeof viewerBrush
  >[0]);
  expect(preset.engine.settings.values.useTexture).toBe(true);
  expect(preset.flow).toBe(0.5);
  expect(preset.engine.settings.blendMode).toBe('Dslv');
  expect(preset.resources.length).toBeGreaterThan(1);
});

it('Charcoal Champ 3 pressure controls flow, while tilt controls size and texture depth', () => {
  const file = new AbrParser().parse(readFileSync(new URL('../../../abr-viewer/src/assets/examples/megapack.abr', import.meta.url)));
  const brush = file.brushes.find((brush) => brush.name === "Kyle's Drawing Box - Charcoal Champ 3");
  expect(brush).toBeDefined();
  const preset = viewerBrush({ ...brush!, patternResources: readPatternIndex(file.rawPatternData!) } as Parameters<
    typeof viewerBrush
  >[0]);
  const values = preset.engine.settings.values;
  expect(values.transfer).toMatchObject({
    flowControl: 2,
    flowJitter: 8,
    flowMinimum: 0,
    opacityControl: 0,
    opacityJitter: 1,
    opacityMinimum: 100
  });
  expect(values.shapeDynamics.sizeControl).toBe(3);
  expect(values.texture.depthControl).toBe(3);
  const stamp = (pressure: number) =>
    createAbrStrokeSampler(
      {
        values,
        size: preset.size,
        opacity: preset.opacity!,
        flow: preset.flow!,
        color: '#000000',
        seed: 1
      },
      preset.resource
    ).add([{ x: 0, y: 0, pressure, tiltX: 30, tiltY: 10, rotation: 0, time: 0 }]).data;
  const strong = stamp(1),
    light = stamp(0.1);
  // Packed attributes: flow responds to pressure; opacity, radius and depth do not.
  expect(light[8]).toBeCloseTo(strong[8]! * 0.1);
  for (const attribute of [2, 3, 9, 10]) expect(light[attribute]).toBe(strong[attribute]);
  expect(light[9]).toBeGreaterThan(0.98);
});
