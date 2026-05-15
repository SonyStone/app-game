import { unpackNumberArray } from '../../utils';

const { round } = Math;

/**
 * Converts HSL input into an internal RGBA tuple.
 *
 * Hue is expected in degrees. Saturation and lightness are normalized to 0..1.
 */
export function hsl2rgb(...args: unknown[]): [number, number, number, number] {
  const values = unpackNumberArray(args, 'hsl');
  if (values == null) {
    throw new Error(`unknown format: ${args}`);
  }

  const [h = 0, s = 0, l = 0] = values;
  let r: number;
  let g: number;
  let b: number;
  if (s === 0) {
    r = l * 255;
    g = l * 255;
    b = l * 255;
  } else {
    const t3: [number, number, number] = [0, 0, 0];
    const channel: [number, number, number] = [0, 0, 0];
    const t2 = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const t1 = 2 * l - t2;
    const hue = h / 360;
    t3[0] = hue + 1 / 3;
    t3[1] = hue;
    t3[2] = hue - 1 / 3;
    for (let index = 0; index < 3; index += 1) {
      if (t3[index] < 0) t3[index] += 1;
      if (t3[index] > 1) t3[index] -= 1;
      if (6 * t3[index] < 1) channel[index] = t1 + (t2 - t1) * 6 * t3[index];
      else if (2 * t3[index] < 1) channel[index] = t2;
      else if (3 * t3[index] < 2) channel[index] = t1 + (t2 - t1) * (2 / 3 - t3[index]) * 6;
      else channel[index] = t1;
    }
    [r, g, b] = [round(channel[0] * 255), round(channel[1] * 255), round(channel[2] * 255)];
  }
  return [r, g, b, values.length > 3 ? (values[3] ?? 1) : 1];
}
