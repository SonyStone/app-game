import type { Color as ColorInstance } from '../color';
import { Color } from '../color';

const { pow, sqrt } = Math;

export function lrgb(col1: ColorInstance, col2: ColorInstance, f: number): Color {
  const [x1 = 0, y1 = 0, z1 = 0] = col1._rgb;
  const [x2 = 0, y2 = 0, z2 = 0] = col2._rgb;
  return new Color(
    sqrt(pow(x1, 2) * (1 - f) + pow(x2, 2) * f),
    sqrt(pow(y1, 2) * (1 - f) + pow(y2, 2) * f),
    sqrt(pow(z1, 2) * (1 - f) + pow(z2, 2) * f),
    'rgb'
  );
}
