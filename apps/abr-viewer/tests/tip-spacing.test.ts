import { expect, test } from 'vitest';
import { createAbrStrokeSampler, stampStride, type PreviewInput } from '@app-game/abr-brush/stroke';
import { brushToFormValues } from '@app-game/abr-brush/form';

// Contract tests stay with the product. Original/Rust reference grids live in photoshop-analysis.
test('a rectangular sampled tip spaces by its minor extent across input batches', () => {
  const input = settings('sampledBrush');
  const tip = { width: 3350, height: 3298 };
  const points = [point(0), point(31.5), point(63), point(126)];
  const sampler = createAbrStrokeSampler(input, tip);
  const chunks = points.flatMap(p => Array.from(sampler.add([p]).data));
  const whole = createAbrStrokeSampler(input, tip).add(points);
  expect(chunks).toEqual(Array.from(whole.data));
  expect(centers(whole.data)).toEqual([0, 15.75, 31.5, 47.25, 63, 78.75, 94.5, 110.25, 126]);
});

test('computed spacing uses stored roundness without depending on source bitmap resolution', () => {
  const input = settings('computedBrush');
  input.values.roundness = 50;
  const points = [point(0), point(64)];
  for (const resolution of [32, 128]) {
    const stroke = createAbrStrokeSampler(input, { width: resolution, height: resolution }).add(points);
    expect(centers(stroke.data)).toEqual([0, 8, 16, 24, 32, 40, 48, 56, 64]);
  }
});

test('secondary sampled tips share the source-spacing rule and previews preserve the remainder', () => {
  const input = { ...settings('sampledBrush'), stampRole: 'secondary' as const };
  const tip = { width: 100, height: 50 };
  const sampler = createAbrStrokeSampler(input, tip);
  sampler.add([point(0)]);
  sampler.preview([point(40)]);
  expect(centers(sampler.add([point(24)]).data)).toEqual([8, 16, 24]);
});

function settings(kind: 'sampledBrush' | 'computedBrush'): PreviewInput & { size: number } {
  const values = brushToFormValues({ id: 'spacing', name: 'Spacing', type: 'computed', settings: {}, diameter: 64, spacing: 25 });
  Object.assign(values, { tipKind: kind, roundness: 100, spacing: 25, spacingEnabled: true,
    useShapeDynamics: false, useScattering: false, useBuildUp: false });
  return { values, size: 64, width: 256, height: 64, dpr: 1, color: '#000000', background: '#ffffff', flow: 1, opacity: 1 };
}
function point(x: number) {
  return { x, y: 0, time: x, pressure: 1, tiltX: 0, tiltY: 0, rotation: 0, pointerType: 'mouse' };
}
function centers(data: Float32Array) {
  return Array.from(data).filter((_, index) => index % stampStride === 0);
}
