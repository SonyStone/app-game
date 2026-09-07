import type { Brush } from '@app-game/abr-parser/reader';
import { expect, it } from 'vitest';
import { viewerBrush } from './viewerBrush';

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

it('reports Mixer Brush instead of silently substituting ordinary paint', () => {
  expect(() =>
    viewerBrush({
      id: 'mixer',
      name: 'Mixer',
      type: 'computed',
      spacing: 25,
      settings: { toolOptions: { __classId: 'mixerBrushTool' } }
    })
  ).toThrow('Mixer Brush');
});
