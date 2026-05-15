import type {
  ColorTemperatureKelvin,
  CssColorString,
  HexString,
  InputFormatHandler,
  InputFormatName,
  ParserColorArguments,
  RgbHexNumber
} from '../types';
import { unpackNumberArray } from '../utils';
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
export const glToRgb: InputFormatHandler = (...args: ParserColorArguments) => {
  const rgba = unpackNumberArray(args, 'rgba');
  if (rgba == null) {
    throw new Error(`unknown format: ${args}`);
  }

  return [(rgba[0] ?? 0) * 255, (rgba[1] ?? 0) * 255, (rgba[2] ?? 0) * 255, rgba[3] ?? 1];
};

/**
 * Normalizes explicit RGB(A) input into the internal RGBA tuple representation.
 */
export const rgbParser: InputFormatHandler = (...args: ParserColorArguments) => {
  const rgba = unpackNumberArray(args, 'rgba');
  if (rgba == null) {
    throw new Error(`unknown format: ${args}`);
  }

  return [rgba[0] ?? 0, rgba[1] ?? 0, rgba[2] ?? 0, rgba[3] ?? 1];
};

/**
 * Parses CSS-compatible color strings into the internal RGBA tuple representation.
 */
export const cssParser: InputFormatHandler = (...args: ParserColorArguments) => {
  const value = args[0];
  if (typeof value !== 'string') {
    throw new Error(`unknown css color: ${String(value ?? '')}`);
  }

  const rgb = css2rgb(value as CssColorString);
  if (rgb == null) {
    throw new Error(`unknown css color: ${value}`);
  }

  return rgb;
};

/**
 * Parses explicit HSV channel input.
 */
export const hsvParser: InputFormatHandler = (...args: ParserColorArguments) => {
  const h = typeof args[0] === 'number' ? args[0] : 0;
  const s = typeof args[1] === 'number' ? args[1] : 0;
  const v = typeof args[2] === 'number' ? args[2] : 0;
  const a = typeof args[3] === 'number' ? args[3] : undefined;
  const rgba = hsv2rgb(h, s, v, a);
  return [rgba[0], rgba[1], rgba[2], rgba[3]];
};

/**
 * Parses hexadecimal color strings.
 */
export const hexParser: InputFormatHandler = (...args: ParserColorArguments) => {
  const value = args[0];
  if (typeof value !== 'string') {
    throw new Error(`unknown hex color: ${String(value ?? '')}`);
  }

  return hex2rgb(value as HexString);
};

/**
 * Parses numeric hexadecimal RGB values in the range 0..16777215.
 */
export const numParser: InputFormatHandler = (...args: ParserColorArguments) => {
  const value = args[0];
  if (typeof value !== 'number') {
    throw new Error(`unknown num color: ${String(value ?? '')}`);
  }

  return num2rgb(value as RgbHexNumber);
};

/**
 * Parses color temperature values in Kelvin.
 */
export const temperatureParser: InputFormatHandler = (...args: ParserColorArguments) => {
  const value = args[0];
  if (typeof value !== 'number') {
    throw new Error(`unknown color temperature: ${String(value ?? '')}`);
  }

  return temperature2rgb(value as ColorTemperatureKelvin);
};

/**
 * Central explicit parser registry used by `Color` and the input registry.
 */
export const formatParsers = {
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
} satisfies Record<Exclude<InputFormatName, 'named'>, InputFormatHandler>;
