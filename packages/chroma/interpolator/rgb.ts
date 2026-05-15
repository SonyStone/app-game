import type { Color as ColorInstance } from '../color';
import { Color } from '../color';

export function rgb(col1: ColorInstance, col2: ColorInstance, f: number): Color {
  const xyz0 = col1._rgb;
  const xyz1 = col2._rgb;
  return new Color(
    (xyz0[0] ?? 0) + f * ((xyz1[0] ?? 0) - (xyz0[0] ?? 0)),
    (xyz0[1] ?? 0) + f * ((xyz1[1] ?? 0) - (xyz0[1] ?? 0)),
    (xyz0[2] ?? 0) + f * ((xyz1[2] ?? 0) - (xyz0[2] ?? 0)),
    'rgb'
  );
}
