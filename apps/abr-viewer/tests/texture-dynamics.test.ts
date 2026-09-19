import { brushToFormValues } from '@app-game/abr-brush/form';
import { createAbrStrokeSampler } from '@app-game/abr-brush/stroke';
import { expect, test } from 'vitest';
import { textureDepth } from '../../../packages/abr-brush/src/textureDynamics';

function values() {
  const v = brushToFormValues({
    id: 'depth',
    name: 'Depth',
    preset: { kind: 'brush', sourceId: 'fixture', ...{}, tip: { kind: 'computed' } },
    resources: [],
    source: { format: 'photoshop-abr/v1' as const, bytes: new Uint8Array() }
  });
  v.useTexture = true;
  Object.assign(v.texture, { eachTip: true, depth: 50, minimumDepth: 50, depthControl: 2, depthJitter: 0 });
  return v;
}

test.each([
  ['Hght', 0, 64],
  ['Hght', 0.25, 80],
  ['Hght', 0.5, 96],
  ['Hght', 1, 128],
  ['linearHeight', 0, 64],
  ['linearHeight', 1, 128],
  ['Mltp', 0, 128],
  ['Mltp', 0.25, 113],
  ['Mltp', 0.5, 97],
  ['Mltp', 1, 65]
] as const)('%s pressure %f yields byte %i', (mode, pressure, expected) => {
  const v = values();
  v.texture.mode = mode;
  expect(textureDepth(v.texture, pressure, 0, () => 0.5)).toBe(expected / 255);
});

test('jitter follows dynamics and reflects at both limits', () => {
  const v = values();
  v.texture.depthJitter = 100;
  expect(textureDepth(v.texture, 0.25, 0, () => 0.5)).toBe(80 / 255);
  expect(textureDepth(v.texture, 0.25, 0, () => 1)).toBe(112 / 255);
  expect(textureDepth(v.texture, 0.25, 0, () => 0)).toBe(112 / 255);
  v.texture.depthControl = 0;
  expect(textureDepth(v.texture, 0, 0, () => 0.5)).toBe(128 / 255);
});

test('zero jitter or a zero range does not advance the depth random stream', () => {
  const v = values();
  const unexpected = () => {
    throw new Error('unexpected random draw');
  };
  textureDepth(v.texture, 0.5, 0, unexpected);
  v.texture.minimumDepth = 100;
  v.texture.depthJitter = 100;
  expect(textureDepth(v.texture, 0.5, 0, unexpected)).toBe(128 / 255);
});

test('Fade uses the fixed-point path, with the correct endpoints', () => {
  const v = values();
  v.texture.depthControl = 1;
  v.texture.depthFade = 3;
  expect([0, 1, 2, 3, 4].map((step) => textureDepth(v.texture, 1, step, () => 0.5) * 255)).toEqual([
    128, 107, 86, 64, 64
  ]);
  v.texture.mode = 'Mltp';
  expect([0, 1, 2, 3].map((step) => textureDepth(v.texture, 1, step, () => 0.5) * 255)).toEqual([64, 86, 107, 128]);
});

test('preview restores the depth stream and input batches do not change the stroke', () => {
  const v = values();
  v.texture.depthJitter = 90;
  const input = {
    values: v,
    size: 20,
    width: 200,
    height: 100,
    dpr: 1,
    color: '#000000',
    background: '#ffffff',
    flow: 1,
    opacity: 1,
    seed: 19
  };
  const tip = { width: 32, height: 32 };
  const point = { x: 0, y: 20, pressure: 0.25, tiltX: 0, tiltY: 0, rotation: 0, time: 0 };
  const end = { ...point, x: 90, time: 20, pressure: 0.75 };
  const a = createAbrStrokeSampler(input, tip);
  const b = createAbrStrokeSampler(input, tip);
  a.add([point]);
  b.add([point]);
  a.preview([{ ...end, x: 140 }]);
  expect(a.add([end])).toEqual(b.add([end]));
  const whole = createAbrStrokeSampler(input, tip).add([point, end]);
  const split = createAbrStrokeSampler(input, tip);
  const first = split.add([point]);
  const second = split.add([end]);
  expect(new Float32Array([...first.data, ...second.data])).toEqual(whole.data);
});
