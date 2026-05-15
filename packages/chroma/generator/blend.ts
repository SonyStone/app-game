/*
 * interpolates between a set of colors uzing a bezier spline
 * blend mode formulas taken from http://www.venture-ware.com/kevin/coding/lets-learn-math-photoshop-blend-modes/
 */

import { Color } from '../color';
import type { ColorValue } from '../types';

export type BlendMode = 'normal' | 'multiply' | 'darken' | 'lighten' | 'screen' | 'overlay' | 'burn' | 'dodge';
type BlendChannel = (a: number, b: number) => number;
type BlendArray = [number, number, number];
type BlendOperation = (bottom: ColorValue, top: ColorValue) => Color;
type RgbReader = () => BlendArray;

function readRgb(color: Color): BlendArray {
  const rgb = color.rgb;
  if (typeof rgb !== 'function') {
    throw new Error('Missing rgb reader');
  }

  return (rgb as RgbReader).call(color);
}

function ensureColor(value: ColorValue): Color {
  return value instanceof Color ? value : new Color(value);
}

const normal: BlendChannel = (a) => a;
const multiply: BlendChannel = (a, b) => (a * b) / 255;
const darken: BlendChannel = (a, b) => (a > b ? b : a);
const lighten: BlendChannel = (a, b) => (a > b ? a : b);
const screen: BlendChannel = (a, b) => 255 * (1 - (1 - a / 255) * (1 - b / 255));
const overlay: BlendChannel = (a, b) => (b < 128 ? (2 * a * b) / 255 : 255 * (1 - 2 * (1 - a / 255) * (1 - b / 255)));
const burn: BlendChannel = (a, b) => 255 * (1 - (1 - b / 255) / (a / 255));
const dodge: BlendChannel = (a, b) => {
  if (a === 255) {
    return 255;
  }

  const value = (255 * (b / 255)) / (1 - a / 255);
  return value > 255 ? 255 : value;
};

function each(fn: BlendChannel): (c0: BlendArray, c1: BlendArray) => BlendArray {
  return (c0, c1) => [fn(c0[0], c1[0]), fn(c0[1], c1[1]), fn(c0[2], c1[2])];
}

function blendFactory(fn: (c0: BlendArray, c1: BlendArray) => BlendArray): BlendOperation {
  return (bottom, top) => {
    const topRgb = readRgb(ensureColor(top));
    const bottomRgb = readRgb(ensureColor(bottom));
    return new Color(fn(topRgb, bottomRgb), 'rgb');
  };
}

type BlendFunction = ((bottom: ColorValue, top: ColorValue, mode: BlendMode) => Color) &
  Record<BlendMode, BlendOperation>;

const blend = ((bottom: ColorValue, top: ColorValue, mode: BlendMode): Color => {
  const operation = blend[mode];
  if (operation == null) {
    throw new Error(`unknown blend mode ${mode}`);
  }

  return operation(bottom, top);
}) as BlendFunction;

blend.normal = blendFactory(each(normal));
blend.multiply = blendFactory(each(multiply));
blend.screen = blendFactory(each(screen));
blend.overlay = blendFactory(each(overlay));
blend.darken = blendFactory(each(darken));
blend.lighten = blendFactory(each(lighten));
blend.dodge = blendFactory(each(dodge));
blend.burn = blendFactory(each(burn));

export { blend };
