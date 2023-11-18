import type { ColorTuple } from '../color';

const NAMES = {
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  green: '#00ff00',
  blue: '#0000ff',
  fuchsia: '#ff00ff',
  cyan: '#00ffff',
  yellow: '#ffff00',
  orange: '#ff8000'
} as const;

export type ColorsNames = keyof typeof NAMES;

export function hexToRGB(hex: string): ColorTuple {
  if (hex.length === 4) {
    hex = hex[0] + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
  }
  const rgb = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);

  if (!rgb) {
    console.warn(`Unable to convert hex string ${hex} to rgb values`);
    return [0, 0, 0];
  }

  return [parseInt(rgb[1], 16) / 255, parseInt(rgb[2], 16) / 255, parseInt(rgb[3], 16) / 255];
}

export function numberToRGB(num: number | string): ColorTuple {
  num = parseInt(num as string);
  return [((num >> 16) & 255) / 255, ((num >> 8) & 255) / 255, (num & 255) / 255];
}

export function parseColor(color?: ColorTuple | number | string | ColorsNames): ColorTuple {
  // Empty
  if (color === undefined) {
    return [0, 0, 0];
  }

  // Decimal
  if (arguments.length === 3) {
    return arguments as unknown as ColorTuple;
  }

  // Number
  if (!isNaN(color as number)) {
    return numberToRGB(color as number);
  }

  // Hex
  if ((color as string)[0] === '#') {
    return hexToRGB(color as string);
  }

  // Names
  if (NAMES[(color as string).toLowerCase() as ColorsNames]) {
    return hexToRGB(NAMES[(color as string).toLowerCase() as ColorsNames]);
  }

  console.warn('Color format not recognised');
  return [0, 0, 0];
}
