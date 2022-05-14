/**
 * Low level shader typed array related functions
 *
 * You should generally not need to use these functions. They are provided
 * for those cases where you're doing something out of the ordinary
 * and you need lower level access.
 *
 * For backward compatibility they are available at both `twgl.typedArray` and `twgl`
 * itself
 *
 * See {@link module:twgl} for core functions
 *
 * @module twgl/typedArray
 */

// make sure we don't see a global gl
const gl = undefined; /* eslint-disable-line */

/**
 * Various GL data format types.
 *
 * @memberof PIXI
 * @static
 * @name TYPES
 * @enum {number}
 * @property {number} UNSIGNED_BYTE=5121
 * @property {number} UNSIGNED_SHORT=5123
 * @property {number} UNSIGNED_SHORT_5_6_5=33635
 * @property {number} UNSIGNED_SHORT_4_4_4_4=32819
 * @property {number} UNSIGNED_SHORT_5_5_5_1=32820
 * @property {number} UNSIGNED_INT=5125
 * @property {number} UNSIGNED_INT_10F_11F_11F_REV=35899
 * @property {number} UNSIGNED_INT_2_10_10_10_REV=33640
 * @property {number} UNSIGNED_INT_24_8=34042
 * @property {number} UNSIGNED_INT_5_9_9_9_REV=35902
 * @property {number} BYTE=5120
 * @property {number} SHORT=5122
 * @property {number} INT=5124
 * @property {number} FLOAT=5126
 * @property {number} FLOAT_32_UNSIGNED_INT_24_8_REV=36269
 * @property {number} HALF_FLOAT=36193
 */
export enum DATA_TYPE {
  BYTE = 0x1400,
  UNSIGNED_BYTE = 0x1401,
  SHORT = 0x1402,
  UNSIGNED_SHORT = 0x1403,
  INT = 0x1404,
  UNSIGNED_INT = 0x1405,
  FLOAT = 0x1406,
  UNSIGNED_SHORT_4_4_4_4 = 0x8033,
  UNSIGNED_SHORT_5_5_5_1 = 0x8034,
  UNSIGNED_SHORT_5_6_5 = 0x8363,
  HALF_FLOAT = 0x140b,
  UNSIGNED_INT_2_10_10_10_REV = 0x8368,
  UNSIGNED_INT_10F_11F_11F_REV = 0x8c3b,
  UNSIGNED_INT_5_9_9_9_REV = 0x8c3e,
  FLOAT_32_UNSIGNED_INT_24_8_REV = 0x8dad,
  UNSIGNED_INT_24_8 = 0x84fa,
}

const glTypeToTypedArray = {
  [DATA_TYPE.BYTE]: Int8Array,
  [DATA_TYPE.UNSIGNED_BYTE]: Uint8Array,
  [DATA_TYPE.SHORT]: Int16Array,
  [DATA_TYPE.UNSIGNED_SHORT]: Uint16Array,
  [DATA_TYPE.INT]: Int32Array,
  [DATA_TYPE.UNSIGNED_INT]: Uint32Array,
  [DATA_TYPE.FLOAT]: Float32Array,
  [DATA_TYPE.UNSIGNED_SHORT_4_4_4_4]: Uint16Array,
  [DATA_TYPE.UNSIGNED_SHORT_5_5_5_1]: Uint16Array,
  [DATA_TYPE.UNSIGNED_SHORT_5_6_5]: Uint16Array,
  [DATA_TYPE.HALF_FLOAT]: Uint16Array,
  [DATA_TYPE.UNSIGNED_INT_2_10_10_10_REV]: Uint32Array,
  [DATA_TYPE.UNSIGNED_INT_10F_11F_11F_REV]: Uint32Array,
  [DATA_TYPE.UNSIGNED_INT_5_9_9_9_REV]: Uint32Array,
  [DATA_TYPE.FLOAT_32_UNSIGNED_INT_24_8_REV]: Uint32Array,
  [DATA_TYPE.UNSIGNED_INT_24_8]: Uint32Array,
};

export type TypedArray =
  | Int8Array
  | Uint8Array
  | Uint8ClampedArray
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array
  | Float32Array
  | ArrayBufferView;

/**
 * Get the GL type for a typedArray
 * @param {ArrayBufferView} typedArray a typedArray
 * @return {number} the GL type for array. For example pass in an `Int8Array` and `gl.BYTE` will
 *   be returned. Pass in a `Uint32Array` and `gl.UNSIGNED_INT` will be returned
 * @memberOf module:twgl/typedArray
 */
export function getGLTypeForTypedArray(typedArray: TypedArray) {
  switch (typedArray.constructor) {
    case Int8Array:
      return DATA_TYPE.BYTE;
    case Uint8Array:
      return DATA_TYPE.UNSIGNED_BYTE;
    case Uint8ClampedArray:
      return DATA_TYPE.UNSIGNED_BYTE;
    case Int16Array:
      return DATA_TYPE.SHORT;
    case Uint16Array:
      return DATA_TYPE.UNSIGNED_SHORT;
    case Int32Array:
      return DATA_TYPE.INT;
    case Uint32Array:
      return DATA_TYPE.UNSIGNED_INT;
    case Float32Array:
      return DATA_TYPE.FLOAT;
    default:
      throw new Error('unsupported typed array type');
  }
}

export type TypedArrayType =
  | typeof Int8Array
  | typeof Uint8Array
  | typeof Uint8ClampedArray
  | typeof Int16Array
  | typeof Uint16Array
  | typeof Int32Array
  | typeof Uint32Array
  | typeof Float32Array;

/**
 * Get the GL type for a typedArray type
 * @param {ArrayBufferView} typedArrayType a typedArray constructor
 * @return {number} the GL type for type. For example pass in `Int8Array` and `gl.BYTE` will
 *   be returned. Pass in `Uint32Array` and `gl.UNSIGNED_INT` will be returned
 * @memberOf module:twgl/typedArray
 */
export function getGLTypeForTypedArrayType(typedArrayType: TypedArrayType) {
  switch (typedArrayType) {
    case Int8Array:
      return DATA_TYPE.BYTE;
    case Uint8Array:
      return DATA_TYPE.UNSIGNED_BYTE;
    case Uint8ClampedArray:
      return DATA_TYPE.UNSIGNED_BYTE;
    case Int16Array:
      return DATA_TYPE.SHORT;
    case Uint16Array:
      return DATA_TYPE.UNSIGNED_SHORT;
    case Int32Array:
      return DATA_TYPE.INT;
    case Uint32Array:
      return DATA_TYPE.UNSIGNED_INT;
    case Float32Array:
      return DATA_TYPE.FLOAT;
    default:
      throw new Error('unsupported typed array type');
  }
}

/**
 * Get the typed array constructor for a given GL type
 * @param {number} type the GL type. (eg: `gl.UNSIGNED_INT`)
 * @return {function} the constructor for a the corresponding typed array. (eg. `Uint32Array`).
 * @memberOf module:twgl/typedArray
 */
export function getTypedArrayTypeForGLType(type: DATA_TYPE) {
  const CTOR = glTypeToTypedArray[type];
  if (!CTOR) {
    throw new Error('unknown gl type');
  }
  return CTOR;
}

export const isArrayBuffer =
  typeof SharedArrayBuffer !== 'undefined'
    ? function isArrayBufferOrSharedArrayBuffer(a: any): a is ArrayBufferView {
        return (
          a?.buffer &&
          (a.buffer instanceof ArrayBuffer ||
            a.buffer instanceof SharedArrayBuffer)
        );
      }
    : function isArrayBuffer(
        a: ArrayBufferView | number[] | any
      ): a is ArrayBufferView {
        return a?.buffer && a.buffer instanceof ArrayBuffer;
      };
