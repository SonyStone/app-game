import { unpack } from '../../utils';
import { LAB_CONSTANTS } from './lab-constants';

const { pow } = Math;

function rgbXyz(value: number): number {
  const normalized = value / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : pow((normalized + 0.055) / 1.055, 2.4);
}

function xyzLab(value: number): number {
  return value > LAB_CONSTANTS.t3 ? pow(value, 1 / 3) : value / LAB_CONSTANTS.t2 + LAB_CONSTANTS.t0;
}

function rgb2xyz(r: number, g: number, b: number): [number, number, number] {
  const red = rgbXyz(r);
  const green = rgbXyz(g);
  const blue = rgbXyz(b);
  return [
    xyzLab((0.4124564 * red + 0.3575761 * green + 0.1804375 * blue) / LAB_CONSTANTS.Xn),
    xyzLab((0.2126729 * red + 0.7151522 * green + 0.072175 * blue) / LAB_CONSTANTS.Yn),
    xyzLab((0.0193339 * red + 0.119192 * green + 0.9503041 * blue) / LAB_CONSTANTS.Zn)
  ];
}

/**
 * Converts RGB input into CIELab coordinates.
 */
export function rgb2lab(...args: unknown[]): [number, number, number] {
  const [r = 0, g = 0, b = 0] = unpack(args, 'rgb') as number[];
  const [x, y, z] = rgb2xyz(r, g, b);
  const l = 116 * y - 16;
  return [l < 0 ? 0 : l, 500 * (x - y), 200 * (y - z)];
}
