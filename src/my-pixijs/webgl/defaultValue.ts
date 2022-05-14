import { GL_DATA_TYPE } from '../../twgl/webgl-static-variables';

function booleanArray(size: number): Array<boolean> {
  const array = new Array(size);

  for (let i = 0; i < array.length; i++) {
    array[i] = false;
  }

  return array;
}

/**
 * @method defaultValue
 * @memberof PIXI.glCore.shader
 * @param {string} type - Type of value
 * @param {number} size
 * @private
 */
export function defaultValue(
  type: GL_DATA_TYPE,
  size: number
):
  | number
  | number[]
  | Float32Array
  | Int32Array
  | Uint32Array
  | boolean
  | boolean[] {
  switch (type) {
    case GL_DATA_TYPE.BOOL:
      return false;

    case GL_DATA_TYPE.FLOAT:
      return 0;
    case GL_DATA_TYPE.FLOAT_VEC2:
      return new Float32Array(2 * size);
    case GL_DATA_TYPE.FLOAT_VEC3:
      return new Float32Array(3 * size);
    case GL_DATA_TYPE.FLOAT_VEC4:
      return new Float32Array(4 * size);

    case GL_DATA_TYPE.INT:
    case GL_DATA_TYPE.UNSIGNED_INT:
    case GL_DATA_TYPE.SAMPLER_2D:
    case GL_DATA_TYPE.SAMPLER_2D_ARRAY:
      return 0;

    case GL_DATA_TYPE.INT_VEC2:
      return new Int32Array(2 * size);
    case GL_DATA_TYPE.INT_VEC3:
      return new Int32Array(3 * size);
    case GL_DATA_TYPE.INT_VEC4:
      return new Int32Array(4 * size);

    case GL_DATA_TYPE.UNSIGNED_INT_VEC2:
      return new Uint32Array(2 * size);
    case GL_DATA_TYPE.UNSIGNED_INT_VEC3:
      return new Uint32Array(3 * size);
    case GL_DATA_TYPE.UNSIGNED_INT_VEC4:
      return new Uint32Array(4 * size);

    case GL_DATA_TYPE.BOOL_VEC2:
      return booleanArray(2 * size);
    case GL_DATA_TYPE.BOOL_VEC3:
      return booleanArray(3 * size);
    case GL_DATA_TYPE.BOOL_VEC4:
      return booleanArray(4 * size);

    case GL_DATA_TYPE.FLOAT_MAT2:
      return new Float32Array([1, 0, 0, 1]);
    case GL_DATA_TYPE.FLOAT_MAT3:
      return new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    case GL_DATA_TYPE.FLOAT_MAT4:
      return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  }

  throw new Error(`Wrong type "${type}"`);
}
