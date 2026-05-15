import type { AlphaChannel, ColorSpaces, RgbChannel, RgbHexNumber } from '../../types';

export function num2rgb(num: RgbHexNumber): ColorSpaces['rgba'] {
  if (typeof num === 'number' && num >= 0 && num <= 0xffffff) {
    return [toRgbChannel(num >> 16), toRgbChannel((num >> 8) & 0xff), toRgbChannel(num & 0xff), toAlphaChannel(1)];
  }

  throw new Error(`unknown num color: ${num}`);
}

function toAlphaChannel(value: number): AlphaChannel {
  return value as AlphaChannel;
}

function toRgbChannel(value: number): RgbChannel {
  return value as RgbChannel;
}
