import { readAdobeBrushFixture } from '../../../../scripts/adobe-brush-fixture.mjs';
import { loadBrushLibrary } from '@app-game/abr-brush/library';
import { createAbrStrokeSampler } from '@app-game/abr-brush/stroke';
import { prepareAbrBrush } from '@app-game/abr-paint/preset';
import { initAbr } from '@app-game/abr-parser';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const adobeFixtures = Object.fromEntries(await Promise.all(['megapack.abr', 'halftones_and_screentones.abr'].map(async (name) => [name, await readAdobeBrushFixture(name)])));

await initAbr(
  readFileSync(new URL('../../../../packages/abr-parser/wasm/pkg/photoshop_abr_wasm_bg.wasm', import.meta.url))
);

it('applies all bundled HSB-color presets without replacing their native color descriptors', () => {
  const file = loadBrushLibrary(
    adobeFixtures['megapack.abr']!
  );
  for (const [name, color] of [
    ["Kyle's FX Box - Add Canvas New", '#9e9e9e'],
    ["Kyle's Paintbox - Gesso Thin", '#f6f5f2'],
    ["Kyle's Paintbox - Gesso Regular", '#f6f5f2'],
    ["Kyle's Paintbox - Gesso Thick", '#f6f6f2']
  ]) {
    const brush = file.brushes.find((brush) => brush.name === name)!;
    expect(brush).toBeDefined();
    const saved = structuredClone(brush.preset.toolOptions);
    const preset = prepareAbrBrush(brush);
    expect(preset.color).toBe(color);
    expect(preset.engine.settings.values.tool.foreground).toBe(color);
    expect(brush.preset.toolOptions).toEqual(saved);
  }
});

it('imports embedded example presets with their full dynamics and auxiliary resources', () => {
  const bytes = adobeFixtures['halftones_and_screentones.abr']!;
  const file = loadBrushLibrary(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const brush = file.brushes.find((brush) => brush.name === "Kyle's Halftone - Circle Range Tiny")!;
  expect(brush).toBeDefined();
  const preset = prepareAbrBrush(brush);
  expect(preset.engine.settings.values.useTexture).toBe(true);
  expect(preset.flow).toBe(0.5);
  expect(preset.engine.settings.blendMode).toBe('Dslv');
  expect(preset.resources.length).toBeGreaterThan(1);
});

it('Charcoal Champ 3 preserves its controls and Photoshop’s pressure-dependent base size', () => {
  const file = loadBrushLibrary(
    adobeFixtures['megapack.abr']!
  );
  const brush = file.brushes.find((brush) => brush.name === "Kyle's Drawing Box - Charcoal Champ 3");
  expect(brush).toBeDefined();
  const preset = prepareAbrBrush(brush!);
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
  // Original 0x103e3ae08 reads pressure for the Pen Tilt size-control branch.
  // Full tilt geometry is separate; the old pressure-independent radius assertion
  // described our previous sampler, not Photoshop's size evaluator.
  expect(light[8]).toBeCloseTo(strong[8]! * 0.1);
  for (const attribute of [2, 3]) expect(light[attribute]).toBeCloseTo(strong[attribute]! * 0.1);
  for (const attribute of [9, 10]) expect(light[attribute]).toBe(strong[attribute]);
  expect(light[9]).toBeGreaterThan(0.98);
});
