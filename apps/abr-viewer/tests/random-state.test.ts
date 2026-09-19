import { brushToFormValues } from '@app-game/abr-brush/form';
import { createAbrStrokeSampler } from '@app-game/abr-brush/stroke';
import { expect, test } from 'vitest';
import { createBrushRandomChannels } from '../../../packages/abr-brush/src/randomChannels';

test('random channels install exact states and keep snapshots independent', () => {
  const state = Array(24).fill(1);
  const channels = createBrushRandomChannels(0, state);
  expect(channels.channel(0)()).toBe(16807 / 2147483648);
  expect(channels.snapshot()[1]).toBe(1);
  const saved = channels.snapshot();
  channels.channel(0)();
  expect(saved[0]).toBe(16807);
  expect(state[0]).toBe(1);
  expect(createBrushRandomChannels(99, saved).snapshot()).toEqual(saved);
  for (const bad of [[], Array(24).fill(0), Array(24).fill(NaN), Array(24).fill(2147483647)])
    expect(() => createBrushRandomChannels(1, bad)).toThrow(RangeError);
});

test('sampler preview restores captured dynamics state and does not change subsequent deposits', () => {
  const values = brushToFormValues({
    id: 'repeatable',
    name: 'Repeatable',
    preset: { kind: 'brush', sourceId: 'fixture', ...{}, tip: { kind: 'computed' } },
    resources: [],
    source: { format: 'photoshop-abr/v1' as const, bytes: new Uint8Array() }
  });
  values.tipKind = 'sampledBrush';
  values.useShapeDynamics = true;
  values.shapeDynamics.sizeJitter = 65;
  values.useScattering = true;
  Object.assign(values.scattering, { scatter: 120, count: 2, countJitter: 40 });
  const input = { values, color: '#123456', opacity: 1, flow: 1, size: 20, randomState: Array(24).fill(12345) };
  const sampler = createAbrStrokeSampler(input, { width: 32, height: 32 });
  const control = createAbrStrokeSampler(input, { width: 32, height: 32 });
  const points = [0, 60, 120].map((x) => ({ x, y: 10, pressure: 1, tiltX: 0, tiltY: 0, rotation: 0, time: x }));
  sampler.add(points.slice(0, 1));
  control.add(points.slice(0, 1));
  const state = sampler.randomState();
  sampler.preview(points.slice(1));
  expect(sampler.randomState()).toEqual(state);
  expect(sampler.add(points.slice(1))).toEqual(control.add(points.slice(1)));
  expect(sampler.randomState()).toEqual(control.randomState());
});

test('requesting sampled geometry does not consume roundness jitter twice with projection', () => {
  const values = brushToFormValues({
    id: 'projected',
    name: 'Projected',
    preset: { kind: 'brush', sourceId: 'fixture', ...{}, tip: { kind: 'computed' } },
    resources: [],
    source: { format: 'photoshop-abr/v1' as const, bytes: new Uint8Array() }
  });
  values.tipKind = 'sampledBrush';
  values.useShapeDynamics = true;
  Object.assign(values.shapeDynamics, { brushProjection: true, roundnessJitter: 40 });
  const input = { values, color: '#123456', opacity: 1, flow: 1, size: 20, randomState: Array(24).fill(12345) };
  const packed = createAbrStrokeSampler(input, { width: 32, height: 32 });
  const geometry = createAbrStrokeSampler({ ...input, sampledTipGeometry: true }, { width: 32, height: 32 });
  const samples = [{ x: 40, y: 40, pressure: 1, tiltX: 10, tiltY: 20, rotation: 0, time: 0 }];
  packed.add(samples);
  geometry.add(samples);
  expect(packed.randomState()).toEqual(geometry.randomState());
});
