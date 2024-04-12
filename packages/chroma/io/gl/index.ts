import { unpack } from '@packages/chroma/utils/unpack';

export const formatGl = (...args: number[] | [{ r: number; g: number; b: number; a: number }]) => {
  const rgb = unpack(args, 'rgba');
  rgb[0] *= 255;
  rgb[1] *= 255;
  rgb[2] *= 255;
  return rgb;
};

export const rgbToGL = (rgb: readonly [number, number, number, number]) => {
  return [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, rgb[3]] as const;
};
