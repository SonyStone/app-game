import type { Color } from '../color';
import { interpolateHsx } from './_hsx';

export function hsi(col1: Color, col2: Color, f: number): Color {
  return interpolateHsx(col1, col2, f, 'hsi');
}
