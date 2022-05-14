import { GL_DATA_TYPE } from '../../twgl/webgl-static-variables';

const setters = {
  // * float
  [GL_DATA_TYPE.FLOAT]:
    (gl: WebGL2RenderingContext, location: WebGLUniformLocation) =>
    (v: number) =>
      gl.uniform1f(location, v),

  [GL_DATA_TYPE.FLOAT_VEC2]:
    (gl: WebGL2RenderingContext, location: WebGLUniformLocation) =>
    (v: number[] | Float32Array) =>
      gl.uniform2f(location, v[0], v[1]),

  [GL_DATA_TYPE.FLOAT_VEC3]:
    (gl: WebGL2RenderingContext, location: WebGLUniformLocation) =>
    (v: number[] | Float32Array) =>
      gl.uniform3f(location, v[0], v[1], v[2]),

  [GL_DATA_TYPE.FLOAT_VEC4]:
    (gl: WebGL2RenderingContext, location: WebGLUniformLocation) =>
    (v: number[] | Float32Array) =>
      gl.uniform4f(location, v[0], v[1], v[2], v[3]),

  // * integer
  [GL_DATA_TYPE.INT]:
    (gl: WebGL2RenderingContext, location: WebGLUniformLocation) =>
    (v: number) =>
      gl.uniform1i(location, v),

  [GL_DATA_TYPE.INT_VEC2]:
    (gl: WebGL2RenderingContext, location: WebGLUniformLocation) =>
    (v: number[] | Int32Array) =>
      gl.uniform2i(location, v[0], v[1]),

  [GL_DATA_TYPE.INT_VEC3]:
    (gl: WebGL2RenderingContext, location: WebGLUniformLocation) =>
    (v: number[] | Int32Array) =>
      gl.uniform3i(location, v[0], v[1], v[2]),

  [GL_DATA_TYPE.INT_VEC4]:
    (gl: WebGL2RenderingContext, location: WebGLUniformLocation) =>
    (v: number[] | Int32Array) =>
      gl.uniform4i(location, v[0], v[1], v[2], v[3]),

  // * unsigned integer
  [GL_DATA_TYPE.UNSIGNED_INT]:
    (gl: WebGL2RenderingContext, location: WebGLUniformLocation) =>
    (v: number) =>
      gl.uniform1ui(location, v),

  [GL_DATA_TYPE.UNSIGNED_INT_VEC2]:
    (gl: WebGL2RenderingContext, location: WebGLUniformLocation) =>
    (v: number[] | Uint32Array) =>
      gl.uniform2ui(location, v[0], v[1]),

  [GL_DATA_TYPE.UNSIGNED_INT_VEC3]:
    (gl: WebGL2RenderingContext, location: WebGLUniformLocation) =>
    (v: number[] | Uint32Array) =>
      gl.uniform3ui(location, v[0], v[1], v[2]),

  [GL_DATA_TYPE.UNSIGNED_INT_VEC4]:
    (gl: WebGL2RenderingContext, location: WebGLUniformLocation) =>
    (v: number[] | Uint32Array) =>
      gl.uniform4ui(location, v[0], v[1], v[2], v[3]),

  // * boolean
  [GL_DATA_TYPE.BOOL]:
    (gl: WebGL2RenderingContext, location: WebGLUniformLocation) =>
    (v: boolean) =>
      gl.uniform1i(location, +v),

  [GL_DATA_TYPE.BOOL_VEC2]:
    (gl: WebGL2RenderingContext, location: WebGLUniformLocation) =>
    (v: boolean[]) =>
      gl.uniform2i(location, +v[0], +v[1]),

  [GL_DATA_TYPE.BOOL_VEC3]:
    (gl: WebGL2RenderingContext, location: WebGLUniformLocation) =>
    (v: boolean[]) =>
      gl.uniform3i(location, +v[0], +v[1], +v[2]),

  [GL_DATA_TYPE.BOOL_VEC4]:
    (gl: WebGL2RenderingContext, location: WebGLUniformLocation) =>
    (v: boolean[]) =>
      gl.uniform4i(location, +v[0], +v[1], +v[2], +v[3]),

  // * float matrix
  [GL_DATA_TYPE.FLOAT_MAT2]:
    (gl: WebGL2RenderingContext, location: WebGLUniformLocation) =>
    (v: number[] | Float32Array) =>
      gl.uniformMatrix2fv(location, false, v),

  [GL_DATA_TYPE.FLOAT_MAT3]:
    (gl: WebGL2RenderingContext, location: WebGLUniformLocation) =>
    (v: number[] | Float32Array) =>
      gl.uniformMatrix3fv(location, false, v),

  [GL_DATA_TYPE.FLOAT_MAT4]:
    (gl: WebGL2RenderingContext, location: WebGLUniformLocation) =>
    (v: number[] | Float32Array) =>
      gl.uniformMatrix4fv(location, false, v),

  // ???
  [GL_DATA_TYPE.SAMPLER_2D]:
    (gl: WebGL2RenderingContext, location: WebGLUniformLocation) =>
    (v: number) =>
      gl.uniform1i(location, v),
  [GL_DATA_TYPE.SAMPLER_CUBE]:
    (gl: WebGL2RenderingContext, location: WebGLUniformLocation) =>
    (v: number) =>
      gl.uniform1i(location, v),
  [GL_DATA_TYPE.SAMPLER_2D_ARRAY]:
    (gl: WebGL2RenderingContext, location: WebGLUniformLocation) =>
    (v: number) =>
      gl.uniform1i(location, v),
};

export function getUniformsSetter(
  gl: WebGL2RenderingContext,
  type: GL_DATA_TYPE,
  location: WebGLUniformLocation
): (v: number | number[]) => void {
  return setters[type](gl, location) as (
    v:
      | number
      | number[]
      | boolean[]
      | Float32Array
      | Int32Array
      | Uint32Array
      | boolean
  ) => void;
}
