import { GL_DATA_TYPE } from '@packages/webgl/static-variables';
import { BUFFER_DATA_USAGE, BUFFER_TARGET } from '@packages/webgl/static-variables/buffer';
import { GL_CONST } from '@packages/webgl/static-variables/static-variables';
import {
  getGLTypeForTypedArray,
  getGLTypeForTypedArrayType,
  getTypedArrayTypeForGLType,
  isArrayBuffer
} from './typedarrays';

export type TypedArray =
  | Int8Array
  | Uint8ClampedArray
  | Uint8Array
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array
  | Float32Array;

export type TypedArrayConstructor =
  | Int8ArrayConstructor
  | Uint8ClampedArrayConstructor
  | Uint8ArrayConstructor
  | Int16ArrayConstructor
  | Uint16ArrayConstructor
  | Int32ArrayConstructor
  | Uint32ArrayConstructor
  | Float32ArrayConstructor;

type AttribPointerArguments = {
  /**
   * number of components for `vertexAttribPointer`. Default is based on the name of the array.
   * If `coord` is in the name assumes `numComponents = 2`.
   * If `color` is in the name assumes `numComponents = 4`.
   * otherwise assumes `numComponents = 3`
   */
  size?: number;

  /**
   * the type of the attribute (eg. `gl.FLOAT`, `gl.UNSIGNED_BYTE`, etc...)
   * @default GL_DATA_TYPE.FLOAT
   */
  type?: GL_DATA_TYPE;

  /**
   * normalized for `vertexAttribPointer`. Default is true if type is `Int8Array` or `Uint8Array` otherwise false.
   */
  normalized?: boolean;

  /**
   * the stride in bytes per element.
   * @default 0
   */
  stride?: number;

  /**
   * offset into buffer in bytes.
   * @default 0
   */
  offset?: number;

  /**
   * the divisor in instances.
   * @default 0
   */
  divisor?: number;
};

/**
 * Use this type of array spec when TWGL can't guess the type or number of components of an array
 */
export type FullArraySpec = AttribPointerArguments & {
  /**
   * a constant value for the attribute. Note: if this is set the attribute will be
   * disabled and set to this constant value and all other values will be ignored.
   */
  value?: number[] | ArrayBufferView;

  /**
   *  The data of the array. A number alone becomes the number of elements of type.
   */
  data?: number | number[] | ArrayBufferView;

  /**
   * type. This is used if `data` is a JavaScript array, or `buffer` is passed in, or `data` is a number.
   * It can either be the constructor for a typedarray. (eg. `Uint8Array`) OR a WebGL type, (eg `gl.UNSIGNED_BYTE`).
   * For example if you want colors in a `Uint8Array` you might have a `FullArraySpec` like `{ type: gl.UNSIGNED_BYTE, data: [255,0,255,255, ...], }`.
   */
  type?: GL_DATA_TYPE | TypedArrayConstructor;

  /**
   * name of attribute this array maps to.
   * Defaults to same name as array prefixed by the default attribPrefix.
   */
  name?: string;

  /**
   * Buffer to use for this attribute. This lets you use your own buffer
   * but you will need to supply `numComponents` and `type`. You can effectively pass an `AttribInfo`
   * to provide this. Example:
   * ```typescript
   * const bufferInfo1 = createBufferInfoFromArrays(gl, {
   *   position: [1, 2, 3, ... ],
   * });
   * const bufferInfo2 = createBufferInfoFromArrays(gl, {
   *   position: bufferInfo1.attribs.position,  // use the same buffer from bufferInfo1
   * });
   */
  buffer?: WebGLBuffer;

  /** the draw type passed to gl.bufferData. Default = gl.STATIC_DRAW */
  drawType?: BUFFER_DATA_USAGE.STATIC_DRAW;
};

/**
 * An individual array in {@link Arrays}
 *
 * When passed to {@link createBufferInfoFromArrays} if an ArraySpec is `number[]` or `ArrayBufferView`
 * the types will be guessed based on the name. `indices` will be `Uint16Array`, everything else will
 * be `Float32Array`. If an ArraySpec is a number it's the number of floats for an empty (zeroed) buffer.
 *
 */
export type ArraySpec = number | number[] | ArrayBufferView | FullArraySpec;

export type Arrays = {
  [key: string]: ArraySpec;
};

export type BufferInfo = {
  /** The number of elements to pass to `gl.drawArrays` or `gl.drawElements`. */
  numElements: number;
  /** The type of indices `UNSIGNED_BYTE`, `UNSIGNED_SHORT` etc.. */
  elementType?: GL_DATA_TYPE;
  /** The indices `ELEMENT_ARRAY_BUFFER` if any indices exist. */
  indices?: WebGLBuffer;

  /** The attribs appropriate to call `setAttributes` */
  attribs?: {
    [key: string]: AttribInfo;
  };
};

export type AttribInfo = AttribPointerArguments & {
  value?: number[] | ArrayBufferView;
  /** the buffer that contains the data for this attribute */
  buffer?: WebGLBuffer;
  /** the draw type passed to gl.bufferData. Default = gl.STATIC_DRAW */
  drawType?: number;
};

export function createBufferInfoFromArrays(
  gl: WebGL2RenderingContext,
  arrays: Arrays,
  srcBufferInfo?: BufferInfo
): BufferInfo {
  const newAttribs = createAttribsFromArrays(gl, arrays);

  const bufferInfo = Object.assign({}, srcBufferInfo ? srcBufferInfo : {}) as BufferInfo;
  bufferInfo.attribs = Object.assign({}, srcBufferInfo ? srcBufferInfo.attribs : {}, newAttribs);
  const indices = arrays.indices;
  if (indices) {
    const newIndices = makeTypedArray(indices, 'indices');
    bufferInfo.indices = createBufferFromTypedArray(gl, newIndices, BUFFER_TARGET.ELEMENT_ARRAY_BUFFER);
    bufferInfo.numElements = (newIndices as TypedArray).length;
    bufferInfo.elementType = getGLTypeForTypedArray(newIndices as TypedArray);
  } else if (!bufferInfo.numElements) {
    bufferInfo.numElements = getNumElementsFromAttributes(gl, bufferInfo.attribs);
  }

  return bufferInfo;
}

function createAttribsFromArrays(gl: WebGL2RenderingContext, arrays: Arrays): Record<string, AttribInfo> {
  const attribs: Record<string, AttribInfo> = {};

  for (const arrayName in arrays) {
    if (!isIndices(arrayName)) {
      const array = arrays[arrayName];

      const name = (array as FullArraySpec).name ?? arrayName;
      if ((array as FullArraySpec).value) {
        if (!Array.isArray((array as FullArraySpec).value) && !isArrayBuffer((array as FullArraySpec).value)) {
          throw new Error('array.value is not array or typedarray');
        }
        attribs[name] = {
          value: (array as FullArraySpec).value
        };
      } else {
        let fn: (gl: WebGL2RenderingContext, array: FullArraySpec, arrayName: string) => AttribBuffer;
        if ((array as FullArraySpec).buffer && (array as FullArraySpec).buffer instanceof WebGLBuffer) {
          fn = attribBufferFromBuffer;
        } else if (typeof array === 'number' || typeof (array as FullArraySpec).data === 'number') {
          fn = attribBufferFromSize;
        } else {
          fn = attribBufferFromArrayLike;
        }
        const { buffer, type, numValues, arrayType } = fn(gl, array as FullArraySpec, arrayName);
        const normalized =
          (array as FullArraySpec).normalize !== undefined
            ? (array as FullArraySpec).normalize
            : getNormalizationForTypedArrayType(arrayType);
        const size = getNumComponents(array as FullArraySpec, arrayName, numValues);
        attribs[name] = {
          buffer: buffer,
          size: size,
          type: type,
          normalized: normalized,
          stride: (array as FullArraySpec).stride || 0,
          offset: (array as FullArraySpec).offset || 0,
          divisor: (array as FullArraySpec).divisor === undefined ? undefined : (array as FullArraySpec).divisor,
          drawType: (array as FullArraySpec).drawType
        };
      }
    }
  }

  gl.bindBuffer(BUFFER_TARGET.ARRAY_BUFFER, null);
  return attribs;
}

function isIndices(name: string) {
  return name === 'indices';
}

type AttribBuffer = {
  buffer: WebGLBuffer;
  numValues: number;
  type: GL_DATA_TYPE;
  arrayType: TypedArrayConstructor;
};

function attribBufferFromBuffer(_gl: WebGL2RenderingContext, array: FullArraySpec): AttribBuffer {
  return {
    buffer: array.buffer!,
    numValues: 2 * 3 * 4, // safely divided by 2, 3, 4
    type: glTypeFromGLTypeOrTypedArrayType(array.type),
    arrayType: typedArrayTypeFromGLTypeOrTypedArrayCtor(array.type)
  };
}

function glTypeFromGLTypeOrTypedArrayType(glTypeOrTypedArrayCtor?: GL_DATA_TYPE | TypedArrayConstructor): GL_DATA_TYPE {
  if (typeof glTypeOrTypedArrayCtor === 'number') {
    return glTypeOrTypedArrayCtor;
  } else if (glTypeOrTypedArrayCtor) {
    return getGLTypeForTypedArrayType(glTypeOrTypedArrayCtor);
  } else {
    return GL_DATA_TYPE.FLOAT;
  }
}

function typedArrayTypeFromGLTypeOrTypedArrayCtor(
  glTypeOrTypedArrayCtor?: GL_DATA_TYPE | TypedArrayConstructor
): TypedArrayConstructor {
  return typeof glTypeOrTypedArrayCtor === 'number'
    ? getTypedArrayTypeForGLType(glTypeOrTypedArrayCtor)
    : glTypeOrTypedArrayCtor || Float32Array;
}

function attribBufferFromSize(gl: WebGL2RenderingContext, array: FullArraySpec): AttribBuffer {
  // ! is array.data always a number?
  const numValues = (array.data || array) as number;
  const arrayType = typedArrayTypeFromGLTypeOrTypedArrayCtor(array.type);
  const numBytes = numValues * arrayType.BYTES_PER_ELEMENT;
  const buffer = gl.createBuffer()!;
  gl.bindBuffer(BUFFER_TARGET.ARRAY_BUFFER, buffer);
  gl.bufferData(BUFFER_TARGET.ARRAY_BUFFER, numBytes, array.drawType || BUFFER_DATA_USAGE.STATIC_DRAW);
  return {
    buffer,
    numValues,
    type: getGLTypeForTypedArrayType(arrayType),
    arrayType
  };
}

function attribBufferFromArrayLike(gl: WebGL2RenderingContext, array: FullArraySpec, arrayName: string): AttribBuffer {
  const typedArray = makeTypedArray(array, arrayName);
  return {
    buffer: createBufferFromTypedArray(gl, typedArray, undefined, array.drawType),
    numValues: 0,
    // ! if typedArray is WebGLBuffer, will throw an error.
    // TODO Should change it
    type: getGLTypeForTypedArray(typedArray as ArrayBufferView),
    arrayType: typedArray.constructor! as TypedArrayConstructor
  };
}

function makeTypedArray(
  array: ArraySpec,
  name: string
): ArrayBuffer | SharedArrayBuffer | ArrayBufferView | TypedArray {
  if (isArrayBuffer(array)) {
    return array;
  }

  if (isArrayBuffer((array as FullArraySpec).data)) {
    return (array as FullArraySpec).data as ArrayBufferView;
  }

  if (Array.isArray(array)) {
    array = {
      data: array
    };
  }

  let Type = (array as FullArraySpec).type
    ? typedArrayTypeFromGLTypeOrTypedArrayCtor((array as FullArraySpec).type)
    : undefined;
  if (!Type) {
    if (isIndices(name)) {
      Type = Uint16Array;
    } else {
      Type = Float32Array;
    }
  }
  return new Type((array as FullArraySpec).data as number[]);
}

/**
 * Given typed array creates a WebGLBuffer and copies the typed array
 * into it.
 *
 * @param typedArray the typed array. Note: If a WebGLBuffer is passed in it will just be returned. No action will be taken
 * @param type the GL bind type for the buffer. Default = `gl.ARRAY_BUFFER`.
 * @param drawType the GL draw type for the buffer. Default = 'gl.STATIC_DRAW`.
 * @return the created WebGLBuffer
 */
function createBufferFromTypedArray(
  gl: WebGL2RenderingContext,
  typedArray: ArrayBuffer | SharedArrayBuffer | ArrayBufferView | WebGLBuffer,
  type?: BUFFER_TARGET,
  drawType?: BUFFER_DATA_USAGE
): WebGLBuffer {
  if (typedArray instanceof WebGLBuffer && gl.isBuffer(typedArray)) {
    return typedArray;
  }
  type = type || BUFFER_TARGET.ARRAY_BUFFER;
  const buffer = gl.createBuffer()!;
  setBufferFromTypedArray(gl, type, buffer, typedArray as ArrayBuffer | SharedArrayBuffer | ArrayBufferView, drawType);
  return buffer;
}

function setBufferFromTypedArray(
  gl: WebGL2RenderingContext,
  type: BUFFER_TARGET,
  buffer: WebGLBuffer | null,
  array: ArrayBuffer | SharedArrayBuffer | ArrayBufferView,
  drawType?: BUFFER_DATA_USAGE
) {
  gl.bindBuffer(type, buffer);
  gl.bufferData(type, array, drawType || BUFFER_DATA_USAGE.STATIC_DRAW);
}

// This is really just a guess. Though I can't really imagine using
// anything else? Maybe for some compression?
function getNormalizationForTypedArrayType(typedArrayType: TypedArrayConstructor): boolean {
  switch (typedArrayType) {
    case Int8Array: {
      return true;
    }
    case Uint8Array: {
      return true;
    }
    default: {
      return false;
    }
  }
}

function getNumComponents(array: FullArraySpec, arrayName: string, numValues: number): number {
  return array.size || guessNumComponentsFromName(arrayName, numValues || getArray(array).length);
}

const texcoordRE = /coord|texture/i;
const colorRE = /color|colour/i;
function guessNumComponentsFromName(name: string, length: number): number {
  let numComponents;
  if (texcoordRE.test(name)) {
    numComponents = 2;
  } else if (colorRE.test(name)) {
    numComponents = 4;
  } else {
    numComponents = 3; // position, normals, indices ...
  }

  if (length % numComponents > 0) {
    throw new Error(
      `Can not guess numComponents for attribute '${name}'. Tried ${numComponents} but ${length} values is not evenly divisible by ${numComponents}. You should specify it.`
    );
  }

  return numComponents;
}

// ! need to check this function
function getArray(array: FullArraySpec | number[]): number[] {
  return (array as number[]).length ? (array as number[]) : ((array as FullArraySpec).data as number[]);
}

const positionKeys = ['position', 'positions', 'a_position'];
function getNumElementsFromAttributes(gl: WebGL2RenderingContext, attribs: Record<string, AttribInfo>): number {
  let key: string;
  let ii: number;
  for (ii = 0; ii < positionKeys.length; ++ii) {
    key = positionKeys[ii];
    if (key in attribs) {
      break;
    }
    if (key in attribs) {
      break;
    }
  }
  if (ii === positionKeys.length) {
    key = Object.keys(attribs)[0];
  }
  const attrib = attribs[key!];
  if (!attrib.buffer) {
    return 1; // There's no buffer
  }
  gl.bindBuffer(BUFFER_TARGET.ARRAY_BUFFER, attrib.buffer);
  const numBytes = gl.getBufferParameter(BUFFER_TARGET.ARRAY_BUFFER, GL_CONST.BUFFER_SIZE);
  gl.bindBuffer(BUFFER_TARGET.ARRAY_BUFFER, null);

  const bytesPerValue = getBytesPerValueForGLType(attrib.type!);
  const totalElements = numBytes / bytesPerValue;
  const numComponents = attrib.size ?? 0;
  // TODO: check stride
  const numElements = totalElements / numComponents;
  if (numElements % 1 !== 0) {
    throw new Error(`numComponents ${numComponents} not correct for length ${length}`);
  }
  return numElements;
}

function getBytesPerValueForGLType(type: GL_DATA_TYPE) {
  switch (type) {
    case GL_DATA_TYPE.BYTE: {
      return 1;
    }
    case GL_DATA_TYPE.UNSIGNED_BYTE: {
      return 1;
    }
    case GL_DATA_TYPE.SHORT: {
      return 2;
    }
    case GL_DATA_TYPE.UNSIGNED_SHORT: {
      return 2;
    }
    case GL_DATA_TYPE.INT: {
      return 4;
    }
    case GL_DATA_TYPE.UNSIGNED_INT: {
      return 4;
    }
    case GL_DATA_TYPE.FLOAT: {
      return 4;
    }
    default: {
      return 0;
    }
  }
}
