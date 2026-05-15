import { unpack } from '../../utils';
import { LAB_CONSTANTS } from './lab-constants';

const { pow } = Math;

function xyzRgb(value: number): number {
  return 255 * (value <= 0.00304 ? 12.92 * value : 1.055 * pow(value, 1 / 2.4) - 0.055);
}

function labXyz(value: number): number {
  return value > LAB_CONSTANTS.t1 ? value * value * value : LAB_CONSTANTS.t2 * (value - LAB_CONSTANTS.t0);
}

/**
 * Converts CIELab coordinates into an internal RGBA tuple.
 */
export function lab2rgb(...args: unknown[]): [number, number, number, number] {
  const lab = unpack(args, 'lab') as number[];
  const [l = 0, a = Number.NaN, b = Number.NaN] = lab;

  const yBase = (l + 16) / 116;
  const xBase = Number.isNaN(a) ? yBase : yBase + a / 500;
  const zBase = Number.isNaN(b) ? yBase : yBase - b / 200;

  const y = LAB_CONSTANTS.Yn * labXyz(yBase);
  const x = LAB_CONSTANTS.Xn * labXyz(xBase);
  const z = LAB_CONSTANTS.Zn * labXyz(zBase);

  return [
    xyzRgb(3.2404542 * x - 1.5371385 * y - 0.4985314 * z),
    xyzRgb(-0.969266 * x + 1.8760108 * y + 0.041556 * z),
    xyzRgb(0.0556434 * x - 0.2040259 * y + 1.0572252 * z),
    lab.length > 3 ? (lab[3] ?? 1) : 1
  ];
}
