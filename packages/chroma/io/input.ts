import { w3cx11 } from '../colors/w3cx11';
import type { InputAutodetectHandler, InputFormatHandler, InputRegistry } from '../types';
import { unpack } from '../utils';
import { css2rgb } from './css/css2rgb';
import { formatParsers } from './format-parsers';
import { hex2rgb } from './hex/hex2rgb';

const namedColors = w3cx11 as Record<string, string>;

/**
 * Parses named CSS colors using the bundled W3C color name table.
 */
const namedParser: InputFormatHandler = (value: unknown) => {
  const name = String(value).toLowerCase();
  const hex = namedColors[name];
  if (hex != null) {
    return hex2rgb(hex as `#${string}`);
  }

  throw new Error(`unknown color name: ${name}`);
};

/**
 * Builds a tuple-based autodetect rule for a specific color mode.
 */
function createTupleAutodetect(
  mode: string,
  priority: number,
  keyOrder: string,
  expectedLength: number
): InputAutodetectHandler {
  return {
    p: priority,
    test: (...args: unknown[]) => {
      const values = unpack(args, keyOrder);
      return Array.isArray(values) && values.length === expectedLength ? mode : undefined;
    }
  };
}
/**
 * Central input registry for explicit parser lookup and format autodetection.
 */

const autodetect: InputAutodetectHandler[] = [
  createTupleAutodetect('hcg', 1, 'hcg', 3),
  createTupleAutodetect('cmyk', 2, 'cmyk', 4),
  createTupleAutodetect('hsl', 2, 'hsl', 3),
  createTupleAutodetect('hsv', 2, 'hsv', 3),
  createTupleAutodetect('lab', 2, 'lab', 3),
  createTupleAutodetect('lch', 2, 'lch', 3),
  createTupleAutodetect('hcl', 2, 'hcl', 3),
  createTupleAutodetect('hsi', 2, 'hsi', 3),
  createTupleAutodetect('rgb', 3, 'rgba', 3),
  {
    p: 3,
    test: (...args: unknown[]) => {
      const values = unpack(args, 'rgba');
      if (!Array.isArray(values)) {
        return undefined;
      }

      const alpha = values[3];
      return values.length === 4 && typeof alpha === 'number' && alpha >= 0 && alpha <= 1 ? 'rgb' : undefined;
    }
  },
  createTupleAutodetect('oklab', 3, 'oklab', 3),
  createTupleAutodetect('oklch', 3, 'oklch', 3),
  {
    p: 4,
    test: (value: unknown, ...rest: unknown[]) => {
      return !rest.length && typeof value === 'string' && [3, 4, 5, 6, 7, 8, 9].includes(value.length)
        ? 'hex'
        : undefined;
    }
  },
  {
    p: 5,
    test: (value: unknown, ...rest: unknown[]) => {
      return !rest.length && typeof value === 'string' && css2rgb.test(value) ? 'css' : undefined;
    }
  },
  {
    p: 5,
    test: (...args: unknown[]) => {
      const [value] = args;
      return args.length === 1 && typeof value === 'number' && value >= 0 && value <= 0xffffff ? 'num' : undefined;
    }
  },
  {
    p: 5,
    test: (value: unknown, ...rest: unknown[]) => {
      return !rest.length && typeof value === 'string' && namedColors[value.toLowerCase()] != null
        ? 'named'
        : undefined;
    }
  }
];

export const input: InputRegistry = {
  format: {
    ...formatParsers,
    named: namedParser
  },
  autodetect
};
