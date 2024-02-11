export type Type = 'i8' | 'ui8' | 'ui8c' | 'i16' | 'ui16' | 'i32' | 'ui32' | 'f32' | 'f64' | 'eid';

export type ListType = readonly [Type, number];

export type TypedArray =
  | Uint8Array
  | Int8Array
  | Uint8Array
  | Uint8ClampedArray
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array
  | Float32Array
  | Float64Array;

export enum TYPES_ENUM {
  i8 = 'i8',
  ui8 = 'ui8',
  ui8c = 'ui8c',
  i16 = 'i16',
  ui16 = 'ui16',
  i32 = 'i32',
  ui32 = 'ui32',
  f32 = 'f32',
  f64 = 'f64',
  eid = 'eid'
}

export type ArrayByType = {
  [TYPES_ENUM.i8]: Int8Array;
  [TYPES_ENUM.ui8]: Uint8Array;
  [TYPES_ENUM.ui8c]: Uint8ClampedArray;
  [TYPES_ENUM.i16]: Int16Array;
  [TYPES_ENUM.ui16]: Uint16Array;
  [TYPES_ENUM.i32]: Int32Array;
  [TYPES_ENUM.ui32]: Uint32Array;
  [TYPES_ENUM.f32]: Float32Array;
  [TYPES_ENUM.f64]: Float64Array;
  [TYPES_ENUM.eid]: Uint32Array;
};

export const TYPES_NAMES = {
  i8: 'Int8',
  ui8: 'Uint8',
  ui8c: 'Uint8Clamped',
  i16: 'Int16',
  ui16: 'Uint16',
  i32: 'Int32',
  ui32: 'Uint32',
  eid: 'Uint32',
  f32: 'Float32',
  f64: 'Float64'
};

export const TYPES = {
  [TYPES_ENUM.i8]: Int8Array,
  [TYPES_ENUM.ui8]: Uint8Array,
  [TYPES_ENUM.ui8c]: Uint8ClampedArray,
  [TYPES_ENUM.i16]: Int16Array,
  [TYPES_ENUM.ui16]: Uint16Array,
  [TYPES_ENUM.i32]: Int32Array,
  [TYPES_ENUM.ui32]: Uint32Array,
  [TYPES_ENUM.f32]: Float32Array,
  [TYPES_ENUM.f64]: Float64Array,
  [TYPES_ENUM.eid]: Uint32Array
};

export const UNSIGNED_MAX = {
  uint8: 2 ** 8,
  uint16: 2 ** 16,
  uint32: 2 ** 32
};
