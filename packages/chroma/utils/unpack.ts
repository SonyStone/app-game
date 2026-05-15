import { type } from './type';

type UnpackableRecord = Record<string, unknown>;
export type UnpackKeyOrder =
  | 'cmyk'
  | 'hcg'
  | 'hcl'
  | 'hsi'
  | 'hsl'
  | 'hsla'
  | 'hsv'
  | 'lab'
  | 'lch'
  | 'oklab'
  | 'oklch'
  | 'rgb'
  | 'rgba';

function isUnpackableRecord(value: unknown): value is UnpackableRecord {
  return type(value) === 'object';
}

export const unpack = (args: readonly unknown[], keyOrder?: UnpackKeyOrder): unknown => {
  // if called with more than 3 arguments, we return the arguments
  if (args.length >= 3) {
    return [...args];
  }

  // with less than 3 args we check if first arg is object
  // and use the keyOrder string to extract and sort properties
  if (isUnpackableRecord(args[0]) && keyOrder) {
    const record = args[0];
    return keyOrder
      .split('')
      .filter((key) => record[key] !== undefined)
      .map((key) => record[key]);
  }

  // otherwise we just return the first argument
  // (which we suppose is an array of args)
  return args[0];
};

export const unpackArray = (args: readonly unknown[], keyOrder?: UnpackKeyOrder): readonly unknown[] | undefined => {
  const value = unpack(args, keyOrder);
  return Array.isArray(value) ? value : undefined;
};

export const unpackNumberArray = (
  args: readonly unknown[],
  keyOrder?: UnpackKeyOrder
): readonly number[] | undefined => {
  const value = unpackArray(args, keyOrder);
  return value != null && value.every((item) => typeof item === 'number') ? value : undefined;
};
