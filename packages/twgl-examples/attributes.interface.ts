import { DATA_TYPE, TypedArrayType } from './typedarrays';

/**
 * The info for an attribute. This is effectively just the arguments to `gl.vertexAttribPointer` plus the WebGLBuffer
 * for the attribute.
 */
export interface AttribInfo {
  /**
   * a constant value for the attribute. Note: if this is set the attribute will be
   * disabled and set to this constant value and all other values will be ignored.
   */
  value?: number[] | ArrayBufferView;

  /** the number of components for this attribute. */
  numComponents?: number;

  /** synonym for `numComponents`. */
  size?: number;

  /**
   * the type of the attribute (eg. `gl.FLOAT`, `gl.UNSIGNED_BYTE`, etc...)
   * @defaultValue `gl.FLOAT`
   **/
  type?: DATA_TYPE;

  /**
   * whether or not to normalize the data.
   * @defaultValue false
   **/
  normalize?: boolean;

  /**
   * offset into buffer in bytes.
   * @defaultValue 0
   **/
  offset?: number;

  /** the stride in bytes per element. Default = 0 */
  stride?: number;

  /**
   * the divisor in instances.
   * @defaultValue undefined.
   * @remarks undefined = don't call gl.vertexAttribDivisor where as anything else = do call it with this value
   **/
  divisor?: number | undefined;

  /** the buffer that contains the data for this attribute */
  buffer?: WebGLBuffer;

  /**
   * the draw type passed to gl.bufferData.
   * @defaultValue gl.STATIC_DRAW
   **/
  drawType?: number;
}

export type Attribs = { [key: string]: AttribInfo };

/**
 * Use this type of array spec when TWGL can't guess the type or number of components of an array
 */
export interface FullArraySpec {
  /**
   * a constant value for the attribute.
   * @remarks if this is set the attribute will be
   * disabled and set to this constant value and all other values will be ignored.
   */
  value?: number[] | ArrayBufferView;

  /**
   * The data of the array. A number alone becomes the number of elements of type.
   */
  data: number | number[] | ArrayBufferView;

  /**
   * number of components for `vertexAttribPointer`.
   * @defaultValue is based on the name of the array.
   * *   If `coord` is in the name assumes `numComponents = 2`.
   * *   If `color` is in the name assumes `numComponents = 4`.
   * *   otherwise assumes `numComponents = 3`
   */
  numComponents?: number;

  /**
   * type. This is only used if `data` is a JavaScript array. It is the constructor for the typedarray. (eg. `Uint8Array`).
   * For example if you want colors in a `Uint8Array` you might have a `FullArraySpec` like `{ type: Uint8Array, data: [255,0,255,255, ...], }`.
   */
  type?: DATA_TYPE | TypedArrayType;
  /**
   * synonym for `numComponents`.
   */
  size?: number;

  /**
   * normalize for `vertexAttribPointer`. Default is true if type is `Int8Array` or `Uint8Array` otherwise false.
   */
  normalize?: boolean;

  /**
   * stride for `vertexAttribPointer`.
   * @defaultValue 0
   */
  stride?: number;

  /**
   * offset for `vertexAttribPointer`.
   * @defaultValue 0
   */
  offset?: number;

  /**
   * divisor for `vertexAttribDivisor`.
   * @defaultValue undefined.
   * @remarks undefined = don't call gl.vertexAttribDivisor
   *    where as anything else = do call it with this value
   */
  divisor?: number;

  /**
   * name of attribute this array maps to. Defaults to same name as array prefixed by the default attribPrefix.
   */
  attrib?: string;

  /**
   * synonym for `attrib`.
   */
  name?: string;

  /**
   * synonym for `attrib`.
   */
  attribName?: string;

  /**
   * Buffer to use for this attribute. This lets you use your own buffer
   *    but you will need to supply `numComponents` and `type`. You can effectively pass an `AttribInfo`
   *    to provide this.
   *
   * @example
   * ```typescript
   * const bufferInfo1 = twgl.createBufferInfoFromArrays(gl, {
   *   position: [1, 2, 3, ... ],
   * });
   * const bufferInfo2 = twgl.createBufferInfoFromArrays(gl, {
   *   position: bufferInfo1.attribs.position,  // use the same buffer from bufferInfo1
   * });
   * ```
   */
  buffer?: WebGLBuffer;

  /**
   * the draw type passed to gl.bufferData.
   * @defaultValue gl.STATIC_DRAW
   **/
  drawType?: number;
}

/**
 * An individual array in {@link module:twgl.Arrays}
 *
 * When passed to {@link module:twgl.createBufferInfoFromArrays} if an ArraySpec is `number[]` or `ArrayBufferView`
 * the types will be guessed based on the name. `indices` will be `Uint16Array`, everything else will
 * be `Float32Array`. If an ArraySpec is a number it's the number of floats for an empty (zeroed) buffer.
 */
export type ArraySpec = number | number[] | ArrayBufferView | FullArraySpec;

/**
 * This is a JavaScript object of arrays by name. The names should match your shader's attributes. If your
 * attributes have a common prefix you can specify it by calling {@link module:twgl.setAttributePrefix}.
 *
 * ## Bare JavaScript Arrays
 * @example
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
 * Objects with various fields. See {@link module:twgl.FullArraySpec}.
 * ```typescript
 * const arrays = {
 *   position: { numComponents: 3, data: [0, 0, 0, 10, 0, 0, 0, 10, 0, 10, 10, 0], },
 *   texcoord: { numComponents: 2, data: [0, 0, 0, 1, 1, 0, 1, 1],                 },
 *   normal:   { numComponents: 3, data: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],     },
 *   indices:  { numComponents: 3, data: [0, 1, 2, 1, 2, 3],                       },
 * };
 * ```
 */
export type Arrays = { [key: string]: ArraySpec };
