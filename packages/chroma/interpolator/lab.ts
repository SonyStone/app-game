import type { Color as ColorInstance } from '../color';
import { Color } from '../color';

type LabReader = () => [number, number, number];

function readLab(color: ColorInstance): [number, number, number] {
  const reader = color.lab;
  if (typeof reader !== 'function') {
    throw new Error('Missing lab reader');
  }

  return (reader as LabReader).call(color);
}

export function lab(col1: ColorInstance, col2: ColorInstance, f: number): Color {
  const xyz0 = readLab(col1);
  const xyz1 = readLab(col2);
  return new Color(
    xyz0[0] + f * (xyz1[0] - xyz0[0]),
    xyz0[1] + f * (xyz1[1] - xyz0[1]),
    xyz0[2] + f * (xyz1[2] - xyz0[2]),
    'lab'
  );
}
