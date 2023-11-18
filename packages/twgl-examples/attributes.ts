import {
  Arrays,
  AttribInfo,
  Attribs,
  FullArraySpec,
} from './attributes.interface';
import {
  DATA_TYPE,
  getGLTypeForTypedArray,
  isArrayBuffer,
  TypedArray,
  TypedArrayType,
} from './typedarrays';
import { isBuffer } from './helper';

const STATIC_DRAW = 0x88e4;
const ARRAY_BUFFER = 0x8892;
const ELEMENT_ARRAY_BUFFER = 0x8893;
const BUFFER_SIZE = 0x8764;

const BYTE = 0x1400;
const UNSIGNED_BYTE = 0x1401;
const SHORT = 0x1402;
const UNSIGNED_SHORT = 0x1403;
const INT = 0x1404;
const UNSIGNED_INT = 0x1405;
const FLOAT = 0x1406;

/**
 * Low level attribute and buffer related functions
 *
 * You should generally not need to use these functions. They are provided
 * for those cases where you're doing something out of the ordinary
 * and you need lower level access.
 *
 * For backward compatibility they are available at both `twgl.attributes` and `twgl`
 * itself
 *
 * See {@link module:twgl} for core functions
 *
 * @module twgl/attributes
 */

// make sure we don't see a global gl
const gl = undefined; /* eslint-disable-line */
const defaults = {
  attribPrefix: '',
};

/**
 * Sets the default attrib prefix
 *
 * When writing shaders I prefer to name attributes with `a_`, uniforms with `u_` and varyings with `v_`
 * as it makes it clear where they came from. But, when building geometry I prefer using un-prefixed names.
 *
 * In other words I'll create arrays of geometry like this
 *
 *     var arrays = {
 *       position: ...
 *       normal: ...
 *       texcoord: ...
 *     };
 *
 * But need those mapped to attributes and my attributes start with `a_`.
 *
 * @deprecated see {@link module:twgl.setDefaults}
 * @param {string} prefix prefix for attribs
 * @memberOf module:twgl/attributes
 */
function setAttributePrefix(prefix) {
  defaults.attribPrefix = prefix;
}

function setDefaults(newDefaults) {
  helper.copyExistingProperties(newDefaults, defaults);
}

function setBufferFromTypedArray(gl:  WebGLRenderingContext | WebGL2RenderingContext, type: number, buffer, array, drawType) {
  gl.bindBuffer(type, buffer);
  gl.bufferData(type, array, drawType || STATIC_DRAW);
}

/**
 * Given typed array creates a WebGLBuffer and copies the typed array
 * into it.
 *
 * @param {WebGLRenderingContext} gl A WebGLRenderingContext
 * @param {ArrayBuffer|SharedArrayBuffer|ArrayBufferView|WebGLBuffer} typedArray the typed array. Note: If a WebGLBuffer is passed in it will just be returned. No action will be taken
 * @param {number} [type] the GL bind type for the buffer. Default = `gl.ARRAY_BUFFER`.
 * @param {number} [drawType] the GL draw type for the buffer. Default = 'gl.STATIC_DRAW`.
 * @return {WebGLBuffer} the created WebGLBuffer
 * @memberOf module:twgl/attributes
 */
function createBufferFromTypedArray(
  gl: WebGLRenderingContext | WebGL2RenderingContext,
  typedArray: ArrayBuffer | SharedArrayBuffer | ArrayBufferView | WebGLBuffer,
  type?: number,
  drawType?: number
): WebGLBuffer {
  if (isBuffer(typedArray)) {
    return typedArray;
  }

  type = type || ARRAY_BUFFER;
  const buffer = gl.createBuffer()!;
  setBufferFromTypedArray(gl, type, buffer, typedArray, drawType);

  return buffer;
}

function isIndices(name: string) {
  return name === 'indices';
}

// This is really just a guess. Though I can't really imagine using
// anything else? Maybe for some compression?
function getNormalizationForTypedArray(typedArray) {
  if (typedArray instanceof Int8Array) {
    return true;
  } // eslint-disable-line
  if (typedArray instanceof Uint8Array) {
    return true;
  } // eslint-disable-line
  return false;
}

// This is really just a guess. Though I can't really imagine using
// anything else? Maybe for some compression?
function getNormalizationForTypedArrayType(typedArrayType) {
  if (typedArrayType === Int8Array) {
    return true;
  } // eslint-disable-line
  if (typedArrayType === Uint8Array) {
    return true;
  } // eslint-disable-line
  return false;
}

function getArray(array) {
  return array.length ? array : array.data;
}

const texcoordRE = /coord|texture/i;
const colorRE = /color|colour/i;

function guessNumComponentsFromName(name: string, length: number) {
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

function getNumComponents(array: number[] | ArrayBufferView | FullArraySpec, arrayName: string) {
  return (
    array.numComponents ||
    array.size ||
    guessNumComponentsFromName(arrayName, getArray(array).length)
  );
}

function makeTypedArray(
  array: number[] | ArrayBufferView | FullArraySpec,
  name: string
): TypedArray {
  if (isArrayBuffer(array)) {
    return array;
  }

  if (Array.isArray(array)) {
    const Type = isIndices(name) ? Uint16Array : Float32Array;

    return new Type(array);
  }

  if (isArrayBuffer(array.data)) {
    return array.data;
  }

  const Type = array.type as TypedArrayType ?? (isIndices(name) ? Uint16Array : Float32Array);

  return new Type(array.data as number[]);
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number';
}

/**
 * Creates a set of attribute data and WebGLBuffers from set of arrays
 *
 * @example
 * Given
 * ```typescript
 * const arrays = {
 *   position: { numComponents: 3, data: [0, 0, 0, 10, 0, 0, 0, 10, 0, 10, 10, 0], },
 *   texcoord: { numComponents: 2, data: [0, 0, 0, 1, 1, 0, 1, 1],                 },
 *   normal:   { numComponents: 3, data: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],     },
 *   color:    { numComponents: 4, data: [255, 255, 255, 255, 255, 0, 0, 255, 0, 0, 255, 255], type: Uint8Array, },
 *   indices:  { numComponents: 3, data: [0, 1, 2, 1, 2, 3],                       },
 * };
 * ```
 *
 * @returns
 * returns something like
 * ```typescript
 * const attribs = {
 *   position: { numComponents: 3, type: gl.FLOAT,         normalize: false, buffer: WebGLBuffer, },
 *   texcoord: { numComponents: 2, type: gl.FLOAT,         normalize: false, buffer: WebGLBuffer, },
 *   normal:   { numComponents: 3, type: gl.FLOAT,         normalize: false, buffer: WebGLBuffer, },
 *   color:    { numComponents: 4, type: gl.UNSIGNED_BYTE, normalize: true,  buffer: WebGLBuffer, },
 * };
 * ```
 * @remarks
 *
 * # Arrays can take various forms
 *
 * ## Bare JavaScript Arrays
 * ```typescript
 * const arrays = {
 *    position: [-1, 1, 0],
 *    normal: [0, 1, 0],
 *    ...
 * }
 * ```
 *
 * ## Bare TypedArrays
 * ```typescript
 * const arrays = {
 *    position: new Float32Array([-1, 1, 0]),
 *    color: new Uint8Array([255, 128, 64, 255]),
 *    ...
 * }
 * ```
 *
 * *   Will guess at `numComponents` if not specified based on name.
 *
 *     If `coord` is in the name assumes `numComponents = 2`
 *
 *     If `color` is in the name assumes `numComponents = 4`
 *
 *     otherwise assumes `numComponents = 3`
 *
 * @param {WebGLRenderingContext} gl The webgl rendering context.
 * @param {module:twgl.Arrays} arrays The arrays
 * @param {module:twgl.BufferInfo} [srcBufferInfo] a BufferInfo to copy from
 *   This lets you share buffers. Any arrays you supply will override
 *   the buffers from srcBufferInfo.
 * @return {Object.<string, module:twgl.AttribInfo>} the attribs
 * @memberOf module:twgl/attributes
 */
function createAttribsFromArrays(
  gl: WebGLRenderingContext | WebGL2RenderingContext,
  arrays: Arrays,
  srcBufferInfo?: BufferInfo
): Attribs {
  const attribs: Attribs = {};

  for (const arrayName in arrays) {
    if (!isIndices(arrayName)) {
      const array = arrays[arrayName];

      function fromNumber(
        gl: WebGLRenderingContext | WebGL2RenderingContext,
        numValue: number
      ): AttribInfo {
        const arrayType = Float32Array;
        const numBytes = numValue * arrayType.BYTES_PER_ELEMENT;

        const buffer = gl.createBuffer()!;
        gl.bindBuffer(ARRAY_BUFFER, buffer);
        gl.bufferData(ARRAY_BUFFER, numBytes, STATIC_DRAW);

        return {
          buffer,
          numComponents: guessNumComponentsFromName(arrayName, numValue),
          type: DATA_TYPE.FLOAT,
          normalize: false,
          stride: 0,
          offset: 0,
          divisor: undefined,
          drawType: undefined,
        };
      }

      function fromNumbers(
        gl: WebGLRenderingContext | WebGL2RenderingContext,
        numValues: number[] | ArrayBufferView
      ): AttribInfo {
        const typedArray = makeTypedArray(numValues, arrayName);



        return {
          buffer: createBufferFromTypedArray(gl, typedArray),
          numComponents: getNumComponents(array, arrayName),
          type: getGLTypeForTypedArray(typedArray),
          normalize: getNormalizationForTypedArray(typedArray),
          stride: 0,
          offset: 0,
          divisor: undefined,
          drawType: undefined,
        };
      }

      function fromArrayBufferView(
        gl: WebGLRenderingContext | WebGL2RenderingContext,
        typedArray: ArrayBufferView
      ): AttribInfo {

        const buffer = gl.createBuffer()!;
        gl.bindBuffer(ARRAY_BUFFER, buffer);
        gl.bufferData(ARRAY_BUFFER, typedArray, STATIC_DRAW);

        arrayName, getArray(array).length)

        return {
          buffer,,
          numComponents: getNumComponents(array, arrayName),
          type: getGLTypeForTypedArray(typedArray),
          normalize: getNormalizationForTypedArray(typedArray),
          stride: 0,
          offset: 0,
          divisor: undefined,
          drawType: undefined,
        };
      }

      function fromArrayValue(array: FullArraySpec): AttribInfo {
        if (!Array.isArray(array.value) && !isArrayBuffer(array.value)) {
          throw new Error('array.value is not array or typedarray');
        }

        return {
          value: array.value,
        };
      }

      function fromArrayBuffer(array: FullArraySpec): AttribInfo {
        return {
          buffer: array.buffer,
          numComponents: array.numComponents || array.size,
          type: array.type as DATA_TYPE,
          normalize: array.normalize,
          stride: array.stride || 0,
          offset: array.offset || 0,
          divisor: array.divisor === undefined ? undefined : array.divisor,
          drawType: array.drawType,
        };
      }

      if (isNumber(array)) {
        attribs[arrayName] = fromNumber(gl, array);

      } else if (Array.isArray(array) || isArrayBuffer(array)) {
        attribs[arrayName] = fromNumbers(gl, array);

      } else if (array.value) {
        const attribName =
          array.attrib || array.name || array.attribName || arrayName;
        attribs[attribName] = fromArrayValue(array);

      } else if (array.buffer && array.buffer instanceof WebGLBuffer) {
        const attribName =
          array.attrib || array.name || array.attribName || arrayName;
        attribs[attribName] = fromArrayBuffer(array);
      } else if ()
    }
  }

  gl.bindBuffer(ARRAY_BUFFER, null);

  return attribs;
}

/**
 * Sets the contents of a buffer attached to an attribInfo
 *
 * This is helper function to dynamically update a buffer.
 *
 * Let's say you make a bufferInfo
 *
 *     var arrays = {
 *        position: new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0, 10, 10, 0]),
 *        texcoord: new Float32Array([0, 0, 0, 1, 1, 0, 1, 1]),
 *        normal:   new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
 *        indices:  new Uint16Array([0, 1, 2, 1, 2, 3]),
 *     };
 *     var bufferInfo = twgl.createBufferInfoFromArrays(gl, arrays);
 *
 *  And you want to dynamically update the positions. You could do this
 *
 *     // assuming arrays.position has already been updated with new data.
 *     twgl.setAttribInfoBufferFromArray(gl, bufferInfo.attribs.position, arrays.position);
 *
 * @param {WebGLRenderingContext} gl
 * @param {AttribInfo} attribInfo The attribInfo who's buffer contents to set. NOTE: If you have an attribute prefix
 *   the name of the attribute will include the prefix.
 * @param {ArraySpec} array Note: it is arguably inefficient to pass in anything but a typed array because anything
 *    else will have to be converted to a typed array before it can be used by WebGL. During init time that
 *    inefficiency is usually not important but if you're updating data dynamically best to be efficient.
 * @param {number} [offset] an optional offset into the buffer. This is only an offset into the WebGL buffer
 *    not the array. To pass in an offset into the array itself use a typed array and create an `ArrayBufferView`
 *    for the portion of the array you want to use.
 *
 *        var someArray = new Float32Array(1000); // an array with 1000 floats
 *        var someSubArray = new Float32Array(someArray.buffer, offsetInBytes, sizeInUnits); // a view into someArray
 *
 *    Now you can pass `someSubArray` into setAttribInfoBufferFromArray`
 * @memberOf module:twgl/attributes
 */
function setAttribInfoBufferFromArray(gl, attribInfo, array, offset) {
  array = makeTypedArray(array);
  if (offset !== undefined) {
    gl.bindBuffer(ARRAY_BUFFER, attribInfo.buffer);
    gl.bufferSubData(ARRAY_BUFFER, offset, array);
  } else {
    setBufferFromTypedArray(
      gl,
      ARRAY_BUFFER,
      attribInfo.buffer,
      array,
      attribInfo.drawType
    );
  }
}

function getBytesPerValueForGLType(gl, type) {
  if (type === BYTE) return 1; // eslint-disable-line
  if (type === UNSIGNED_BYTE) return 1; // eslint-disable-line
  if (type === SHORT) return 2; // eslint-disable-line
  if (type === UNSIGNED_SHORT) return 2; // eslint-disable-line
  if (type === INT) return 4; // eslint-disable-line
  if (type === UNSIGNED_INT) return 4; // eslint-disable-line
  if (type === FLOAT) return 4; // eslint-disable-line
  return 0;
}

// Tries to get the number of elements from a set of arrays.
const positionKeys = ['position', 'positions', 'a_position'];
function getNumElementsFromNonIndexedArrays(arrays) {
  let key;
  let ii;
  for (ii = 0; ii < positionKeys.length; ++ii) {
    key = positionKeys[ii];
    if (key in arrays) {
      break;
    }
  }
  if (ii === positionKeys.length) {
    key = Object.keys(arrays)[0];
  }
  const array = arrays[key];
  const length = getArray(array).length;
  const numComponents = getNumComponents(array, key);
  const numElements = length / numComponents;
  if (length % numComponents > 0) {
    throw new Error(
      `numComponents ${numComponents} not correct for length ${length}`
    );
  }
  return numElements;
}

function getNumElementsFromAttributes(gl, attribs) {
  let key;
  let ii;
  for (ii = 0; ii < positionKeys.length; ++ii) {
    key = positionKeys[ii];
    if (key in attribs) {
      break;
    }
    key = defaults.attribPrefix + key;
    if (key in attribs) {
      break;
    }
  }
  if (ii === positionKeys.length) {
    key = Object.keys(attribs)[0];
  }
  const attrib = attribs[key];
  gl.bindBuffer(ARRAY_BUFFER, attrib.buffer);
  const numBytes = gl.getBufferParameter(ARRAY_BUFFER, BUFFER_SIZE);
  gl.bindBuffer(ARRAY_BUFFER, null);

  const bytesPerValue = getBytesPerValueForGLType(gl, attrib.type);
  const totalElements = numBytes / bytesPerValue;
  const numComponents = attrib.numComponents || attrib.size;
  // TODO: check stride
  const numElements = totalElements / numComponents;
  if (numElements % 1 !== 0) {
    throw new Error(
      `numComponents ${numComponents} not correct for length ${length}`
    );
  }
  return numElements;
}

export interface BufferInfo {
  /** The number of elements to pass to `gl.drawArrays` or `gl.drawElements`. */
  numElements: number;

  /** The type of indices `UNSIGNED_BYTE`, `UNSIGNED_SHORT` etc.. */
  elementType?: number;

  /** The indices `ELEMENT_ARRAY_BUFFER` if any indices exist. */
  indices?: WebGLBuffer;

  /** The attribs appropriate to call `setAttributes` */
  attribs?: { [key: string]: AttribInfo };
}

/**
 * Creates a BufferInfo from an object of arrays.
 *
 * This can be passed to {@link module:twgl.setBuffersAndAttributes} and to
 * {@link module:twgl:drawBufferInfo}.
 *
 * Given an object like
 *
 *     var arrays = {
 *       position: { numComponents: 3, data: [0, 0, 0, 10, 0, 0, 0, 10, 0, 10, 10, 0], },
 *       texcoord: { numComponents: 2, data: [0, 0, 0, 1, 1, 0, 1, 1],                 },
 *       normal:   { numComponents: 3, data: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],     },
 *       indices:  { numComponents: 3, data: [0, 1, 2, 1, 2, 3],                       },
 *     };
 *
 *  Creates an BufferInfo like this
 *
 *     bufferInfo = {
 *       numElements: 4,        // or whatever the number of elements is
 *       indices: WebGLBuffer,  // this property will not exist if there are no indices
 *       attribs: {
 *         position: { buffer: WebGLBuffer, numComponents: 3, },
 *         normal:   { buffer: WebGLBuffer, numComponents: 3, },
 *         texcoord: { buffer: WebGLBuffer, numComponents: 2, },
 *       },
 *     };
 *
 *  The properties of arrays can be JavaScript arrays in which case the number of components
 *  will be guessed.
 *
 *     var arrays = {
 *        position: [0, 0, 0, 10, 0, 0, 0, 10, 0, 10, 10, 0],
 *        texcoord: [0, 0, 0, 1, 1, 0, 1, 1],
 *        normal:   [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
 *        indices:  [0, 1, 2, 1, 2, 3],
 *     };
 *
 *  They can also be TypedArrays
 *
 *     var arrays = {
 *        position: new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0, 10, 10, 0]),
 *        texcoord: new Float32Array([0, 0, 0, 1, 1, 0, 1, 1]),
 *        normal:   new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
 *        indices:  new Uint16Array([0, 1, 2, 1, 2, 3]),
 *     };
 *
 *  Or AugmentedTypedArrays
 *
 *     var positions = createAugmentedTypedArray(3, 4);
 *     var texcoords = createAugmentedTypedArray(2, 4);
 *     var normals   = createAugmentedTypedArray(3, 4);
 *     var indices   = createAugmentedTypedArray(3, 2, Uint16Array);
 *
 *     positions.push([0, 0, 0, 10, 0, 0, 0, 10, 0, 10, 10, 0]);
 *     texcoords.push([0, 0, 0, 1, 1, 0, 1, 1]);
 *     normals.push([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]);
 *     indices.push([0, 1, 2, 1, 2, 3]);
 *
 *     var arrays = {
 *        position: positions,
 *        texcoord: texcoords,
 *        normal:   normals,
 *        indices:  indices,
 *     };
 *
 * For the last example it is equivalent to
 *
 *     var bufferInfo = {
 *       attribs: {
 *         position: { numComponents: 3, buffer: gl.createBuffer(), },
 *         texcoord: { numComponents: 2, buffer: gl.createBuffer(), },
 *         normal: { numComponents: 3, buffer: gl.createBuffer(), },
 *       },
 *       indices: gl.createBuffer(),
 *       numElements: 6,
 *     };
 *
 *     gl.bindBuffer(gl.ARRAY_BUFFER, bufferInfo.attribs.position.buffer);
 *     gl.bufferData(gl.ARRAY_BUFFER, arrays.position, gl.STATIC_DRAW);
 *     gl.bindBuffer(gl.ARRAY_BUFFER, bufferInfo.attribs.texcoord.buffer);
 *     gl.bufferData(gl.ARRAY_BUFFER, arrays.texcoord, gl.STATIC_DRAW);
 *     gl.bindBuffer(gl.ARRAY_BUFFER, bufferInfo.attribs.normal.buffer);
 *     gl.bufferData(gl.ARRAY_BUFFER, arrays.normal, gl.STATIC_DRAW);
 *     gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bufferInfo.indices);
 *     gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, arrays.indices, gl.STATIC_DRAW);
 *
 * @param {WebGLRenderingContext} gl A WebGLRenderingContext
 * @param {module:twgl.Arrays} arrays Your data
 * @param {module:twgl.BufferInfo} [srcBufferInfo] An existing
 *        buffer info to start from. WebGLBuffers etc specified
 *        in the srcBufferInfo will be used in a new BufferInfo
 *        with any arrays specified overriding the ones in
 *        srcBufferInfo.
 * @return {module:twgl.BufferInfo} A BufferInfo
 * @memberOf module:twgl/attributes
 */
function createBufferInfoFromArrays(gl, arrays, srcBufferInfo) {
  const newAttribs = createAttribsFromArrays(gl, arrays);
  const bufferInfo = Object.assign({}, srcBufferInfo ? srcBufferInfo : {});
  bufferInfo.attribs = Object.assign(
    {},
    srcBufferInfo ? srcBufferInfo.attribs : {},
    newAttribs
  );
  const indices = arrays.indices;
  if (indices) {
    const newIndices = makeTypedArray(indices, 'indices');
    bufferInfo.indices = createBufferFromTypedArray(
      gl,
      newIndices,
      ELEMENT_ARRAY_BUFFER
    );
    bufferInfo.numElements = newIndices.length;
    bufferInfo.elementType = typedArrays.getGLTypeForTypedArray(newIndices);
  } else if (!bufferInfo.numElements) {
    bufferInfo.numElements = getNumElementsFromAttributes(
      gl,
      bufferInfo.attribs
    );
  }

  return bufferInfo;
}

/**
 * Creates a buffer from an array, typed array, or array spec
 *
 * Given something like this
 *
 *     [1, 2, 3],
 *
 * or
 *
 *     new Uint16Array([1,2,3]);
 *
 * or
 *
 *     {
 *        data: [1, 2, 3],
 *        type: Uint8Array,
 *     }
 *
 * returns a WebGLBuffer that contains the given data.
 *
 * @param {WebGLRenderingContext} gl A WebGLRenderingContext.
 * @param {module:twgl.ArraySpec} array an array, typed array, or array spec.
 * @param {string} arrayName name of array. Used to guess the type if type can not be derived otherwise.
 * @return {WebGLBuffer} a WebGLBuffer containing the data in array.
 * @memberOf module:twgl/attributes
 */
function createBufferFromArray(gl, array, arrayName) {
  const type = arrayName === 'indices' ? ELEMENT_ARRAY_BUFFER : ARRAY_BUFFER;
  const typedArray = makeTypedArray(array, arrayName);
  return createBufferFromTypedArray(gl, typedArray, type);
}

/**
 * Creates buffers from arrays or typed arrays
 *
 * Given something like this
 *
 *     var arrays = {
 *        positions: [1, 2, 3],
 *        normals: [0, 0, 1],
 *     }
 *
 * returns something like
 *
 *     buffers = {
 *       positions: WebGLBuffer,
 *       normals: WebGLBuffer,
 *     }
 *
 * If the buffer is named 'indices' it will be made an ELEMENT_ARRAY_BUFFER.
 *
 * @param {WebGLRenderingContext} gl A WebGLRenderingContext.
 * @param {module:twgl.Arrays} arrays
 * @return {Object<string, WebGLBuffer>} returns an object with one WebGLBuffer per array
 * @memberOf module:twgl/attributes
 */
function createBuffersFromArrays(gl, arrays) {
  const buffers = {};
  Object.keys(arrays).forEach(function (key) {
    buffers[key] = createBufferFromArray(gl, arrays[key], key);
  });

  // Ugh!
  if (arrays.indices) {
    buffers.numElements = arrays.indices.length;
    buffers.elementType = typedArrays.getGLTypeForTypedArray(
      makeTypedArray(arrays.indices),
      'indices'
    );
  } else {
    buffers.numElements = getNumElementsFromNonIndexedArrays(arrays);
  }

  return buffers;
}

export {
  createAttribsFromArrays,
  createBuffersFromArrays,
  createBufferFromArray,
  createBufferFromTypedArray,
  createBufferInfoFromArrays,
  setAttribInfoBufferFromArray,
  setAttributePrefix,
  setDefaults as setAttributeDefaults_,
  getNumComponents as getNumComponents_,
  getArray as getArray_,
};
