import type { InputFormatHandler } from '../types';
import { unpack } from '../utils';
import { cmyk2rgb } from './cmyk/cmyk2rgb';
import { css2rgb } from './css/css2rgb';
import { hcg2rgb } from './hcg/hcg2rgb';
import { hex2rgb } from './hex/hex2rgb';
import { hsi2rgb } from './hsi/hsi2rgb';
import { hsl2rgb } from './hsl/hsl2rgb';
import { hsv2rgb } from './hsv/hsv2rgb';
import { lab2rgb } from './lab/lab2rgb';
import { hcl2rgb } from './lch/hcl2rgb';
import { lch2rgb } from './lch/lch2rgb';
import { num2rgb } from './num/num2rgb';
import { oklab2rgb } from './oklab/oklab2rgb';
import { oklch2rgb } from './oklch/oklch2rgb';
import { temperature2rgb } from './temp/temperature2rgb';

/**
 * Converts normalized GL channel input in the range 0..1 into internal RGB channel values.
 */
export const glToRgb: InputFormatHandler = (...args: unknown[]) => {
  const rgba = unpack(args, 'rgba');
  if (!Array.isArray(rgba)) {
    throw new Error(`unknown format: ${args}`);
  }

  return [(rgba[0] ?? 0) * 255, (rgba[1] ?? 0) * 255, (rgba[2] ?? 0) * 255, rgba[3] ?? 1];
};

/**
 * Normalizes explicit RGB(A) input into the internal RGBA tuple representation.
 */
export const rgbParser: InputFormatHandler = (...args: unknown[]) => {
  const rgba = unpack(args, 'rgba');
  if (!Array.isArray(rgba)) {
    throw new Error(`unknown format: ${args}`);
  }

  return [rgba[0] ?? 0, rgba[1] ?? 0, rgba[2] ?? 0, rgba[3] ?? 1];
};

/**
 * Parses CSS-compatible color strings into the internal RGBA tuple representation.
 */
export const cssParser: InputFormatHandler = (...args: unknown[]) => {
  const rgb = css2rgb(String(args[0] ?? ''));
  if (rgb == null) {
    throw new Error(`unknown css color: ${String(args[0] ?? '')}`);
  }

  return rgb;
};

/**
 * Parses explicit HSV channel input.
 */
export const hsvParser: InputFormatHandler = (...args: unknown[]) => {
  const [h = 0, s = 0, v = 0, a] = args as number[];
  return [...hsv2rgb(h, s, v, a)] as number[];
};

/**
 * Parses hexadecimal color strings.
 */
export const hexParser: InputFormatHandler = (...args: unknown[]) =>
  hex2rgb(String(args[0] ?? '') as `#${string}`) as number[];

/**
 * Parses numeric hexadecimal RGB values in the range 0..16777215.
 */
export const numParser: InputFormatHandler = (...args: unknown[]) => num2rgb(Number(args[0] ?? Number.NaN));

/**
 * Parses color temperature values in Kelvin.
 */
export const temperatureParser: InputFormatHandler = (...args: unknown[]) =>
  temperature2rgb(Number(args[0] ?? Number.NaN));

/**
 * Central explicit parser registry used by `Color` and the input registry.
 */
export const formatParsers: Record<string, InputFormatHandler> = {
  cmyk: cmyk2rgb,
  css: cssParser,
  hcg: hcg2rgb,
  hcl: hcl2rgb,
  hex: hexParser,
  hsi: hsi2rgb,
  hsl: hsl2rgb,
  hsv: hsvParser,
  kelvin: temperatureParser,
  lab: lab2rgb,
  lch: lch2rgb,
  num: numParser,
  oklab: oklab2rgb,
  oklch: oklch2rgb,
  rgb: rgbParser,
  temp: temperatureParser,
  temperature: temperatureParser,
  gl: glToRgb
};
