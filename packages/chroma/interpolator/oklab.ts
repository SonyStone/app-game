import type { Color as ColorInstance } from '../color';
import { Color } from '../color';

type OklabReader = () => [number, number, number];

function readOklab(color: ColorInstance): [number, number, number] {
  const reader = color.oklab;
  if (typeof reader !== 'function') {
    throw new Error('Missing oklab reader');
  }

  return (reader as OklabReader).call(color);
}

export function oklab(col1: ColorInstance, col2: ColorInstance, f: number): Color {
  const xyz0 = readOklab(col1);
  const xyz1 = readOklab(col2);
  return new Color(
    xyz0[0] + f * (xyz1[0] - xyz0[0]),
    xyz0[1] + f * (xyz1[1] - xyz0[1]),
    xyz0[2] + f * (xyz1[2] - xyz0[2]),
    'oklab'
  );
}
