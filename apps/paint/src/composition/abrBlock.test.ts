import { blockEraserTip, blockEraserValues } from '@app-game/abr-brush/blockEraser';
import { brushToFormValues } from '@app-game/abr-brush/form';
import { createAbrStrokeSampler } from '@app-game/abr-brush/stroke';
import { expect, it } from 'vitest';
import { viewerBrush } from '../brushLibrary/viewerBrush';

it('Block preserves dormant preset data while applying a screen-sized square without resources', () => {
  const source = {
    id: 'block',
    name: 'Block',
    type: 'sampled' as const,
    spacing: 500,
    diameter: 512,
    settings: {
      useTexture: true,
      useTipDynamics: true,
      dualBrush: { useDualBrush: true },
      toolOptions: { __classId: 'ErTl', ErsB: 3, flow: 1, Opct: 2 }
    }
  };
  const preset = viewerBrush(source);
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
  const values = brushToFormValues({ id: 'b', name: 'Block', type: 'computed', spacing: 25, settings: {} });
  expect(blockEraserValues(values, { zoom: 1, angle: Math.PI / 6, mirrored: false }).angle).toBeCloseTo(-30);
  expect(blockEraserValues(values, { zoom: 1, angle: Math.PI / 6, mirrored: true }).angle).toBeCloseTo(30);
  expect(() => blockEraserValues(values, { zoom: 0, angle: 0, mirrored: false })).toThrow('positive zoom');
});
