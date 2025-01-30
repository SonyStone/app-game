import { GL_DATA_TYPE } from '@packages/webgl/static-variables';
import { GL_CONST } from '@packages/webgl/static-variables/static-variables';
import type { FullArraySpec, TypedArray, TypedArrayConstructor } from './attributes';

export const isArrayBuffer =
  typeof SharedArrayBuffer !== 'undefined'
    ? function isArrayBufferOrSharedArrayBuffer(
        a?: number | number[] | ArrayBufferView | FullArraySpec
      ): a is ArrayBufferView {
        return (
          (a as ArrayBufferView)?.buffer &&
          ((a as ArrayBufferView).buffer instanceof ArrayBuffer ||
            (a as ArrayBufferView).buffer instanceof SharedArrayBuffer)
        );
      }
    : function isArrayBuffer(a?: number | number[] | ArrayBufferView | FullArraySpec): a is ArrayBufferView {
        return (a as ArrayBufferView)?.buffer && (a as ArrayBufferView).buffer instanceof ArrayBuffer;
      };

/**
 * Get the GL type for a typedArray
 * @param typedArray a typedArray
 * @return the GL type for array. For example pass in an `Int8Array` and `gl.BYTE` will
 *   be returned. Pass in a `Uint32Array` and `gl.UNSIGNED_INT` will be returned
 */
// prettier-ignore
export function getGLTypeForTypedArray(typedArray: ArrayBufferView | TypedArray) {
  if (typedArray instanceof Int8Array)         { return GL_DATA_TYPE.BYTE; }          
  if (typedArray instanceof Uint8Array)        { return GL_DATA_TYPE.UNSIGNED_BYTE; } 
  if (typedArray instanceof Uint8ClampedArray) { return GL_DATA_TYPE.UNSIGNED_BYTE; } 
  if (typedArray instanceof Int16Array)        { return GL_DATA_TYPE.SHORT; }         
  if (typedArray instanceof Uint16Array)       { return GL_DATA_TYPE.UNSIGNED_SHORT; }
  if (typedArray instanceof Int32Array)        { return GL_DATA_TYPE.INT; }           
  if (typedArray instanceof Uint32Array)       { return GL_DATA_TYPE.UNSIGNED_INT; }  
  if (typedArray instanceof Float32Array)      { return GL_DATA_TYPE.FLOAT; }         
  throw new Error('unsupported typed array type');
}

/**
 * Get the GL type for a typedArray type
 * @param {ArrayBufferView} typedArrayType a typedArray constructor
 * @return {number} the GL type for type. For example pass in `Int8Array` and `gl.BYTE` will
 *   be returned. Pass in `Uint32Array` and `gl.UNSIGNED_INT` will be returned
 * @memberOf module:twgl/typedArray
 */
export function getGLTypeForTypedArrayType(typedArrayType: TypedArrayConstructor): GL_DATA_TYPE {
  switch (typedArrayType) {
    case Int8Array:
      return GL_DATA_TYPE.BYTE;
    case Uint8Array:
      return GL_DATA_TYPE.UNSIGNED_BYTE;
    case Uint8ClampedArray:
      return GL_DATA_TYPE.UNSIGNED_BYTE;
    case Int16Array:
      return GL_DATA_TYPE.SHORT;
    case Uint16Array:
      return GL_DATA_TYPE.UNSIGNED_SHORT;
    case Int32Array:
      return GL_DATA_TYPE.INT;
    case Uint32Array:
      return GL_DATA_TYPE.UNSIGNED_INT;
    case Float32Array:
      return GL_DATA_TYPE.FLOAT;
    default:
      throw new Error('unsupported typed array type');
  }
}

// prettier-ignore
const glTypeToTypedArray = {
  [GL_DATA_TYPE.BYTE]                       : Int8Array,
  [GL_DATA_TYPE.UNSIGNED_BYTE]              : Uint8Array,
  [GL_DATA_TYPE.SHORT]                      : Int16Array,
  [GL_DATA_TYPE.UNSIGNED_SHORT]             : Uint16Array,
  [GL_DATA_TYPE.INT]                        : Int32Array,
  [GL_DATA_TYPE.UNSIGNED_INT]               : Uint32Array,
  [GL_DATA_TYPE.FLOAT]                      : Float32Array,
  [GL_CONST.UNSIGNED_SHORT_4_4_4_4]         : Uint16Array,
  [GL_CONST.UNSIGNED_SHORT_5_5_5_1]         : Uint16Array,
  [GL_CONST.UNSIGNED_SHORT_5_6_5]           : Uint16Array,
  [GL_DATA_TYPE.HALF_FLOAT]                 : Uint16Array,
  [GL_CONST.UNSIGNED_INT_2_10_10_10_REV]    : Uint32Array,
  [GL_CONST.UNSIGNED_INT_10F_11F_11F_REV]   : Uint32Array,
  [GL_CONST.UNSIGNED_INT_5_9_9_9_REV]       : Uint32Array,
  [GL_CONST.FLOAT_32_UNSIGNED_INT_24_8_REV] : Uint32Array,
  [GL_CONST.UNSIGNED_INT_24_8]              : Uint32Array,
} as const

export function getTypedArrayTypeForGLType(type: GL_DATA_TYPE) {
  const CTOR = glTypeToTypedArray[type as keyof typeof glTypeToTypedArray];
  if (!CTOR) {
    throw new Error('unknown gl type');
  }
  return CTOR;
}
