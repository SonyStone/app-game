/**
 * Represents a constructor for number arrays.
 * It can be one of the following types:
 * - float
 * - - `Float32ArrayConstructor`
 * - - `Float64ArrayConstructor`
 * - int
 * - - `Int8ArrayConstructor`
 * - - `Int16ArrayConstructor`
 * - - `Int32ArrayConstructor`
 * - uint
 * - - `Uint8ArrayConstructor`
 * - - `Uint8ClampedArrayConstructor`
 * - - `Uint16ArrayConstructor`
 * - - `Uint32ArrayConstructor`
 */
export type TypedArrayConstructor =
  // float
  | Float32ArrayConstructor
  | Float64ArrayConstructor
  // int
  | Int8ArrayConstructor
  | Int16ArrayConstructor
  | Int32ArrayConstructor
  // uint
  | Uint8ArrayConstructor
  | Uint8ClampedArrayConstructor
  | Uint16ArrayConstructor
  | Uint32ArrayConstructor;

export type TypedArray =
  | Float32Array
  | Float64Array
  // | Array<number>
  | Int8Array
  | Int16Array
  | Int32Array
  | Uint8Array
  | Uint16Array
  | Uint32Array
  | Uint8ClampedArray;

export interface NumberArray {
  length: number;
  [n: number]: number;
}
