import type { Color as ColorInstance } from '../color';
import { Color } from '../color';

type NumReader = () => number;

function readNum(color: ColorInstance): number {
  const reader = color.num;
  if (typeof reader !== 'function') {
    throw new Error('Missing num reader');
  }

  return (reader as NumReader).call(color);
}

export function num(col1: ColorInstance, col2: ColorInstance, f: number): Color {
  const c1 = readNum(col1);
  const c2 = readNum(col2);
  return new Color(c1 + f * (c2 - c1), 'num');
}
