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
export type NumberArrayConstructor =
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
