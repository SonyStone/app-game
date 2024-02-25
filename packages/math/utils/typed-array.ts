/**
 * Represents a constructor for number arrays.
 * It can be one of the following types:
 * - `Float32ArrayConstructor`
 * - `Float64ArrayConstructor`
 * - `Uint8ArrayConstructor`
 * - `Int8ArrayConstructor`
 * - `Uint16ArrayConstructor`
 * - `Int16ArrayConstructor`
 * - `Uint32ArrayConstructor`
 * - `Int32ArrayConstructor`
 * - `ArrayConstructor`
 */
export type TypedArrayConstructor =
  | Float32ArrayConstructor
  | Float64ArrayConstructor
  | ArrayConstructor
  | Int8ArrayConstructor
  | Int16ArrayConstructor
  | Int32ArrayConstructor
  | Uint8ArrayConstructor
  | Uint16ArrayConstructor
  | Uint32ArrayConstructor
  | Uint8ClampedArrayConstructor;

export type TypedArray =
  | Float32Array
  | Float64Array
  | Array<number>
  | Int8Array
  | Int16Array
  | Int32Array
  | Uint8Array
  | Uint16Array
  | Uint32Array
  | Uint8ClampedArray;
