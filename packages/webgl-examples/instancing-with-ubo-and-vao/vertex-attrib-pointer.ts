export type VertexAttribPointerType =
  | WebGL2RenderingContext['BYTE']
  | WebGL2RenderingContext['SHORT']
  | WebGL2RenderingContext['UNSIGNED_BYTE']
  | WebGL2RenderingContext['UNSIGNED_SHORT']
  | WebGL2RenderingContext['FLOAT']
  | WebGL2RenderingContext['HALF_FLOAT']
  | WebGL2RenderingContext['INT']
  | WebGL2RenderingContext['UNSIGNED_INT']
  | WebGL2RenderingContext['INT_2_10_10_10_REV']
  | WebGL2RenderingContext['UNSIGNED_INT_2_10_10_10_REV'];

export type VertexAttribPointer = {
  /**
   * The index of the vertex attribute that is to be modified
   */
  index: number;

  /**
   * The number of components per vertex attribute. Must be 1, 2, 3, or 4
   */
  size: 1 | 2 | 3 | 4;

  /**
   * The data type of each component in the array
   */
  type: VertexAttribPointerType;

  /**
   * Whether integer data values should be normalized into a certain range when being cast to a float.
   * - For types `BYTE` and `SHORT`, normalizes the values to `[-1, 1]` if `true`.
   * - For types `UNSIGNED_BYTE` and `UNSIGNED_SHORT`, normalizes the values to `[0, 1]` if `true`.
   * - For types `FLOAT` and `HALF_FLOAT`, this parameter has no effect.
   */
  normalize: boolean; // whether integer data values should be normalized

  /**
   * The offset in bytes between the beginning of consecutive vertex attributes
   */
  stride: number;

  /**
   * An offset in bytes of the first component in the vertex attribute array.
   * Must be a multiple of the byte length of `type`.
   */
  offset: number;
};

export const VertexAttribPointerDefault: VertexAttribPointer = {
  index: 0,
  size: 3,
  type: WebGL2RenderingContext.FLOAT,
  normalize: false,
  stride: 0,
  offset: 0
};

/**
 * A vertex attribute pointer that specifies that the data is an integer
 */
export type VertexAttribIPointer = {
  isInteger: true;
};

export type VertexAttribDivisor = {
  divisor: number;
};
