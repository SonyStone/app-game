import { expect, it } from 'vitest';
import { prepareCurveBins } from './prepareCurveBins';

it('indexes monotone boundaries conservatively, shares repeated outlines and preserves source records', () => {
  const curves = new Float32Array(10 * 8);

  for (let i = 0; i < 10; i++) {
    curves[i * 8 + 1] = i / 16;
    curves[i * 8 + 7] = (i + 2) / 16;
  }

  // Horizontal edge exactly on a row boundary must be present in that row too.
  curves[1] = curves[7] = 0.5;
  const instances = new Uint32Array(3 * 20);

  for (let i = 0; i < 3; i++) {
    instances[i * 20 + 17] = 10;
  }

  instances[2 * 20 + 7] = 1;
  const existing = new Uint32Array(513);
  existing[1] = 513;
  const input = {
    curves: curves.buffer,
    instances: instances.buffer,
    clips: instances.slice(0, 20).buffer,
    curveBins: existing.buffer
  };
  const before = instances.slice();
  const result = prepareCurveBins(input);
  const draws = new Uint32Array(result.instances);
  const bins = new Uint32Array(result.bins);
  const offset = draws[7]!;

  expect(offset).toBeGreaterThan(512);
  expect(draws[27]).toBe(offset);
  expect(new Uint32Array(result.clips)[7]).toBe(offset);
  expect(draws[47]).toBe(1);
  expect(bins.slice(0, existing.length)).toEqual(existing);
  expect(instances).toEqual(before);

  for (let row = 0; row < 128; row++) {
    const first = bins[offset + row * 2]!;
    const count = bins[offset + row * 2 + 1]!;
    const expected = Array.from({ length: 10 }, (_, i) => i).filter((i) => {
      const low = Math.floor(Math.min(curves[i * 8 + 1]!, curves[i * 8 + 7]!) * 128);
      const high = Math.floor(Math.max(curves[i * 8 + 1]!, curves[i * 8 + 7]!) * 128);
      return row >= low && row <= high;
    });
    expect([...bins.slice(first, first + count)]).toEqual(expected);
  }
});
