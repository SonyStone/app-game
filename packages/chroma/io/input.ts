import { isNamedColorName, w3cx11 } from '../colors/w3cx11';
import type {
  AutodetectPriority,
  InputAutodetectHandler,
  InputFormatHandler,
  InputFormatName,
  InputRegistry,
  ParserColorArguments
} from '../types';
import { unpackArray } from '../utils';
import type { UnpackKeyOrder } from '../utils/unpack';
import { css2rgb } from './css/css2rgb';
import { formatParsers } from './format-parsers';
import { hex2rgb } from './hex/hex2rgb';

const namedColors = w3cx11;

function toAutodetectPriority(value: number): AutodetectPriority {
  return value as AutodetectPriority;
}

/**
 * Parses named CSS colors using the bundled W3C color name table.
 */
const namedParser: InputFormatHandler = (...args) => {
  const value = args[0];
  const name = String(value).toLowerCase();
  if (isNamedColorName(name)) {
    return hex2rgb(namedColors[name]);
  }

  throw new Error(`unknown color name: ${name}`);
};

/**
 * Builds a tuple-based autodetect rule for a specific color mode.
 */
function createTupleAutodetect(
  mode: InputFormatName,
  priority: AutodetectPriority,
  keyOrder: UnpackKeyOrder,
  expectedLength: number
): InputAutodetectHandler {
  return {
    p: priority,
    test: (...args: ParserColorArguments) => {
      const values = unpackArray(args, keyOrder);
      return values != null && values.length === expectedLength ? mode : undefined;
    }
  };
}
/**
 * Central input registry for explicit parser lookup and format autodetection.
 */

const autodetect: InputAutodetectHandler[] = [
  createTupleAutodetect('hcg', toAutodetectPriority(1), 'hcg', 3),
  createTupleAutodetect('cmyk', toAutodetectPriority(2), 'cmyk', 4),
  createTupleAutodetect('hsl', toAutodetectPriority(2), 'hsl', 3),
  createTupleAutodetect('hsv', toAutodetectPriority(2), 'hsv', 3),
  createTupleAutodetect('lab', toAutodetectPriority(2), 'lab', 3),
  createTupleAutodetect('lch', toAutodetectPriority(2), 'lch', 3),
  createTupleAutodetect('hcl', toAutodetectPriority(2), 'hcl', 3),
  createTupleAutodetect('hsi', toAutodetectPriority(2), 'hsi', 3),
  createTupleAutodetect('rgb', toAutodetectPriority(3), 'rgba', 3),
  {
    p: toAutodetectPriority(3),
    test: (...args: ParserColorArguments) => {
      const values = unpackArray(args, 'rgba');
      if (values == null) {
        return undefined;
      }

      const alpha = values[3];
      return values.length === 4 && typeof alpha === 'number' && alpha >= 0 && alpha <= 1 ? 'rgb' : undefined;
    }
  },
  createTupleAutodetect('oklab', toAutodetectPriority(3), 'oklab', 3),
  createTupleAutodetect('oklch', toAutodetectPriority(3), 'oklch', 3),
  {
    p: toAutodetectPriority(4),
    test: (value, ...rest) => {
      return !rest.length && typeof value === 'string' && [3, 4, 5, 6, 7, 8, 9].includes(value.length)
        ? 'hex'
        : undefined;
    }
  },
  {
    p: toAutodetectPriority(5),
    test: (value, ...rest) => {
      return !rest.length && typeof value === 'string' && css2rgb.test(value) ? 'css' : undefined;
    }
  },
  {
    p: toAutodetectPriority(5),
    test: (...args: ParserColorArguments) => {
      const [value] = args;
      return args.length === 1 && typeof value === 'number' && value >= 0 && value <= 0xffffff ? 'num' : undefined;
    }
  },
  {
    p: toAutodetectPriority(5),
    test: (value, ...rest) => {
      if (rest.length || typeof value !== 'string') {
        return undefined;
      }

      return isNamedColorName(value.toLowerCase()) ? 'named' : undefined;
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
