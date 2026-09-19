import { blockEraserTip, blockEraserValues } from '@app-game/abr-brush/blockEraser';
import { brushToFormValues } from '@app-game/abr-brush/form';
import { createAbrStrokeSampler } from '@app-game/abr-brush/stroke';
import { prepareAbrBrush } from '@app-game/abr-paint/preset';
import { percent, pixels } from '@app-game/abr-parser';
import { expect, it } from 'vitest';

it('Block preserves dormant preset data while applying a screen-sized square without resources', () => {
  const source = {
    id: 'block',
    name: 'Block',
    preset: {
      kind: 'brush',
      sourceId: 'fixture',
      ...{
        textureEnabled: true,
        shapeDynamicsEnabled: true,
        dualBrush: { kind: 'dualBrush', enabled: true },
        toolOptions: { kind: 'ErTl', eraserMode: 3, flow: 1, opacity: 2 }
      },
      tip: { kind: 'sampled', diameter: pixels(512), spacing: percent(500) }
    },
    resources: [],
    source: { format: 'photoshop-abr/v1' as const, bytes: new Uint8Array() }
  };
  const preset = prepareAbrBrush(source);
  expect(preset.resources).toHaveLength(1);
  expect(preset.resource.pixels).toEqual(new Uint8Array([255]));
  expect(preset.opacity).toBe(1);
  const saved = structuredClone(preset.engine.settings.values);
  for (const zoom of [0.05, 0.5, 1, 2, 16]) {
    const values = blockEraserValues(saved, { zoom, angle: 0, mirrored: false });
    expect(values.diameter * zoom).toBe(16);
    expect(values.useTexture).toBe(false);
    expect(values.useDualBrush).toBe(false);
    expect(values.useShapeDynamics).toBe(false);
    const input = { values, size: values.diameter, color: '#000000', opacity: 1, flow: 1, seed: 1 };
    const sampler = () => createAbrStrokeSampler(input, blockEraserTip());
    const points = [0, 1, 2, 3].map((i) => ({
      x: 100 + i * 10,
      y: 100,
      time: i * 10,
      pressure: i / 3,
      tiltX: 60,
      tiltY: 45,
      rotation: 90
    }));
    const together = sampler().add(points).data;
    const split = sampler();
    expect([...together]).toEqual(points.flatMap((point) => [...split.add([point]).data]));
    for (let i = 0; i < together.length; i += 16) {
      expect(together[i + 8]).toBe(1);
      expect(together[i + 9]).toBe(1);
    }
  }
  expect(preset.engine.settings.values).toEqual(saved);
  expect(saved.tool).toMatchObject({ opacity: 2, flow: 1 });
});

it('Block rejects an invalid view and compensates for rotation and mirror', () => {
  const values = brushToFormValues({
    id: 'b',
    name: 'Block',
    preset: { kind: 'brush', sourceId: 'fixture', ...{}, tip: { kind: 'computed', spacing: percent(25) } },
    resources: [],
    source: { format: 'photoshop-abr/v1' as const, bytes: new Uint8Array() }
  });
  expect(blockEraserValues(values, { zoom: 1, angle: Math.PI / 6, mirrored: false }).angle).toBeCloseTo(-30);
  expect(blockEraserValues(values, { zoom: 1, angle: Math.PI / 6, mirrored: true }).angle).toBeCloseTo(30);
  expect(() => blockEraserValues(values, { zoom: 0, angle: 0, mirrored: false })).toThrow('positive zoom');
});
